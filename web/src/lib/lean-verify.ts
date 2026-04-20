import { Sandbox } from "e2b";

const LEAN_TEMPLATE = "lean-formal-conjectures-v4-28";
const PROJ_DIR = "/home/user/formal-conjectures";
const REPL_DIR = "/home/user/repl";
const USER_LAKE = "/home/user/.elan/bin/lake";
const WARM_IMPORT = "import FormalConjectures.Util.ProblemImports";
const REPL_START_CMD = `cd ${PROJ_DIR} && ${USER_LAKE} env ${REPL_DIR}/.lake/build/bin/repl`;
const CMD_TIMEOUT_MS = 120_000;
const WARM_TIMEOUT_MS = 300_000;

const PRELOADED_IMPORTS = new Set([
  "import Mathlib",
  "import FormalConjectures.Util.ProblemImports",
]);

interface ReplResponse {
  env?: number;
  messages?: Array<{ severity?: string; data?: string }>;
}

interface VerifierConfig {
  statement: string;
  verifier: string;
  antitrivial?: string;
}

export interface ProofVerifyResult {
  score: number;
  error?: string;
  details: {
    user_ok: boolean;
    verify_ok: boolean;
    has_sorry: boolean;
    is_trivial: boolean;
    elapsed_ms: number;
  };
}

function parseImports(leanCode: string): {
  extraImports: string[];
  code: string;
} {
  const extra: string[] = [];
  const kept: string[] = [];
  for (const line of leanCode.split("\n")) {
    const s = line.trim();
    if (s.startsWith("import ")) {
      if (!PRELOADED_IMPORTS.has(s)) extra.push(s);
    } else {
      kept.push(line);
    }
  }
  return { extraImports: extra, code: kept.join("\n").trim() };
}

/**
 * Manages a Lean 4 REPL running inside an E2B sandbox and exposes
 * the three-step proof verification protocol:
 *   1. Compile user code
 *   2. Type-check canonical verifier statement
 *   3. Anti-triviality check (open problems only)
 */
export class LeanVerifier {
  private sbx: Sandbox | null = null;
  private pid = 0;
  private warmEnv = 0;
  private ownsSandbox = false;

  private buffer = "";
  private pendingResolve: ((v: ReplResponse) => void) | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    const warmId = process.env.LEAN_WARM_SANDBOX_ID;
    const t0 = Date.now();

    if (warmId) {
      this.sbx = await Sandbox.connect(warmId, { timeoutMs: 60_000 });
      this.ownsSandbox = false;
      console.log(
        `[lean] connected to warm sandbox ${warmId} (${Date.now() - t0}ms)`,
      );
    } else {
      this.sbx = await Sandbox.create(LEAN_TEMPLATE, {
        apiKey: process.env.E2B_API_KEY,
        timeoutMs: 600_000,
      });
      this.ownsSandbox = true;
      console.log(
        `[lean] created sandbox from template (${Date.now() - t0}ms)`,
      );
    }

    await this.startRepl();
    await this.warmRepl();
  }

  // ── REPL lifecycle ──────────────────────────────────────────────

  private async startRepl(): Promise<void> {
    try {
      await this.sbx!.commands.run("pkill -f repl", { timeoutMs: 5_000 });
    } catch {
      /* may not exist yet */
    }
    await sleep(2_000);

    const handle = await this.sbx!.commands.run(REPL_START_CMD, {
      background: true,
      stdin: true,
      onStdout: (data: string) => this.onData(data),
      onStderr: (data: string) => {
        if (data.trim()) {
          console.log(`[lean:stderr] ${data.trim().slice(0, 200)}`);
        }
      },
      timeoutMs: 600_000,
    });
    this.pid = handle.pid;
    console.log(`[lean] REPL started (pid=${this.pid})`);
  }

  private async warmRepl(): Promise<void> {
    console.log("[lean] warming REPL (loading Mathlib imports)...");
    const t0 = Date.now();
    const resp = await this.sendCmd(WARM_IMPORT, undefined, WARM_TIMEOUT_MS);
    this.warmEnv = resp.env ?? 0;
    const errors = resp.messages?.filter((m) => m.severity === "error") ?? [];
    console.log(
      `[lean] REPL warmed (env=${this.warmEnv}, ${Date.now() - t0}ms)`,
    );
    if (errors.length > 0) {
      throw new Error(
        `warm import failed: ${errors.map((e) => e.data).join("; ").slice(0, 500)}`,
      );
    }
  }

  // ── REPL I/O ────────────────────────────────────────────────────

  private onData(data: string): void {
    this.buffer += data;
    if (!this.pendingResolve) return;

    const trimmed = this.buffer.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed) as ReplResponse;
      this.buffer = "";
      if (this.pendingTimer) {
        clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
      }
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve(parsed);
    } catch {
      if (this.buffer.length > 10_000) {
        console.warn(
          `[lean] large non-JSON buffer (${this.buffer.length} bytes), truncating`,
        );
        this.buffer = "";
      }
    }
  }

  private async sendCmd(
    cmd: string,
    env?: number,
    timeoutMs = CMD_TIMEOUT_MS,
  ): Promise<ReplResponse> {
    this.buffer = "";

    const promise = new Promise<ReplResponse>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingTimer = setTimeout(() => {
        this.pendingResolve = null;
        this.pendingTimer = null;
        reject(
          new Error(
            `REPL timeout (${timeoutMs}ms). Buffer: ${this.buffer.slice(0, 500)}`,
          ),
        );
      }, timeoutMs);
    });

    const obj: Record<string, unknown> = { cmd };
    if (env !== undefined) obj.env = env;
    const payload = JSON.stringify(obj) + "\n\n";
    await this.sbx!.commands.sendStdin(this.pid, payload);

    return promise;
  }

  // ── Three-step verification ─────────────────────────────────────

  async verifyProof(
    leanCode: string,
    verifierJson: string,
  ): Promise<ProofVerifyResult> {
    const t0 = Date.now();
    const config: VerifierConfig = JSON.parse(verifierJson);
    const { extraImports, code } = parseImports(leanCode);

    let env = this.warmEnv;

    for (const imp of extraImports) {
      const resp = await this.sendCmd(imp, env);
      env = resp.env ?? env;
    }

    // Step 1 — compile user code
    const userResp = await this.sendCmd(code, env);
    const userEnv = userResp.env ?? env;
    const userMsgs = userResp.messages ?? [];
    const userOk = !userMsgs.some((m) => m.severity === "error");
    const hasSorry = userMsgs.some((m) => (m.data ?? "").includes("sorry"));

    if (!userOk) {
      const errors = userMsgs
        .filter((m) => m.severity === "error")
        .map((m) => m.data)
        .join("; ");
      return {
        score: 0,
        error: `compilation_error: ${errors.slice(0, 500)}`,
        details: {
          user_ok: false,
          verify_ok: false,
          has_sorry: hasSorry,
          is_trivial: false,
          elapsed_ms: Date.now() - t0,
        },
      };
    }

    // Step 2 — type-check canonical verifier
    const verifyResp = await this.sendCmd(config.verifier, userEnv);
    const verifyMsgs = verifyResp.messages ?? [];
    const verifyOk = !verifyMsgs.some((m) => m.severity === "error");

    if (!verifyOk) {
      const errors = verifyMsgs
        .filter((m) => m.severity === "error")
        .map((m) => m.data)
        .join("; ");
      return {
        score: 0,
        error: `verification_failed: ${errors.slice(0, 500)}`,
        details: {
          user_ok: true,
          verify_ok: false,
          has_sorry: hasSorry,
          is_trivial: false,
          elapsed_ms: Date.now() - t0,
        },
      };
    }

    // Step 3 — anti-triviality (open problems only)
    let isTrivial = false;
    if (config.antitrivial) {
      const trivResp = await this.sendCmd(config.antitrivial, userEnv);
      const trivMsgs = trivResp.messages ?? [];
      isTrivial = !trivMsgs.some((m) => m.severity === "error");
    }

    const valid = verifyOk && !hasSorry && !isTrivial;
    let error: string | undefined;
    if (hasSorry) error = "proof uses sorry";
    else if (isTrivial) error = "trivial self-referential answer";

    return {
      score: valid ? 1 : 0,
      error,
      details: {
        user_ok: true,
        verify_ok: verifyOk,
        has_sorry: hasSorry,
        is_trivial: isTrivial,
        elapsed_ms: Date.now() - t0,
      },
    };
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  async close(): Promise<void> {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    if (this.sbx && this.ownsSandbox) {
      try {
        await this.sbx.kill();
      } catch {
        /* best-effort */
      }
    }
    this.sbx = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
