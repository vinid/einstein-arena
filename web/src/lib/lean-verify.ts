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

const DEFAULT_ALLOWED_IMPORT_PREFIXES = ["Mathlib", "FormalConjectures"];

const DEFAULT_ALLOWED_AXIOMS = new Set([
  "propext",
  "Classical.choice",
  "Quot.sound",
]);

// ── Types ───────────────────────────────────────────────────────────

interface ReplResponse {
  env?: number;
  messages?: Array<{ severity?: string; data?: string }>;
}

/** Legacy config shape used by old-style `verifyProof()` */
interface LegacyVerifierConfig {
  statement: string;
  verifier: string;
  antitrivial?: string;
}

export interface ProofVerifyResult {
  score: number;
  error?: string;
  details: {
    user_ok: boolean;
    exact_ok: boolean;
    verify_ok: boolean;
    axioms_ok: boolean;
    answer_ok: boolean;
    has_sorry: boolean;
    is_trivial: boolean;
    bad_axioms: string[];
    bad_answer_refs: string[];
    elapsed_ms: number;
  };
}

/** Input to the new structured verification path */
export interface StructuredProofInput {
  proofKind: "formula_proof" | "claim_proof";

  extraImports?: string[];
  answerExpr?: string;
  proof: string;
  claim?: string;

  leanTemplate?: string;
  leanTemplateYes?: string;
  leanTemplateNo?: string;

  theoremName?: string;
  answerName?: string;
  exactVerifier?: string;
  forbiddenAnswerConsts?: string[];
  allowedAxioms?: string[];
  allowedImportPrefixes?: string[];
  allowedClaims?: string[];
  antitrivial?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function summarizeErrors(resp: ReplResponse): string {
  return (resp.messages ?? [])
    .filter((m) => m.severity === "error")
    .map((m) => m.data ?? "")
    .join("; ")
    .slice(0, 1000);
}

function containsSorryText(resp: ReplResponse): boolean {
  return (resp.messages ?? []).some((m) => (m.data ?? "").includes("sorry"));
}

function parseAxioms(text: string): string[] {
  if (!text.trim()) return [];
  if (/does not depend on any axioms/i.test(text)) return [];

  const out = new Set<string>();
  const bracketMatches = text.match(/\[[^\]]*\]/g) ?? [];
  for (const block of bracketMatches) {
    const inner = block.slice(1, -1).trim();
    if (!inner) continue;
    for (const part of inner.split(",")) {
      const name = part.trim().replace(/^`|`$/g, "");
      if (name) out.add(name);
    }
  }
  return [...out];
}

function parseConstants(text: string): string[] {
  const out = new Set<string>();
  const matches = text.matchAll(/\b([A-Z][\w.]*\.\w[\w.]*)\b/g);
  for (const m of matches) out.add(m[1]);
  return [...out];
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

function validateImports(
  imports: string[],
  allowedPrefixes: string[],
): string | null {
  for (const imp of imports) {
    const mod = imp.replace(/^import\s+/, "").trim();
    const ok = allowedPrefixes.some(
      (p) => mod === p || mod.startsWith(p + "."),
    );
    if (!ok) return `forbidden import: ${mod}`;
  }
  return null;
}

function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

function buildLeanModule(input: StructuredProofInput): string {
  if (input.proofKind === "formula_proof") {
    if (!input.leanTemplate) throw new Error("leanTemplate required for formula_proof");
    if (!input.answerExpr) throw new Error("answerExpr required for formula_proof");

    const importBlock = (input.extraImports ?? []).map((i) =>
      i.startsWith("import ") ? i : `import ${i}`,
    ).join("\n");

    return input.leanTemplate
      .replace("{{extra_imports}}", importBlock)
      .replace("{{answer_expr}}", indentBlock(input.answerExpr, 2))
      .replace("{{proof}}", indentBlock(input.proof, 2));
  }

  if (input.proofKind === "claim_proof") {
    if (!input.claim) throw new Error("claim required for claim_proof");
    const template =
      input.claim === "yes" ? input.leanTemplateYes : input.leanTemplateNo;
    if (!template) throw new Error(`leanTemplate${input.claim === "yes" ? "Yes" : "No"} required`);

    const importBlock = (input.extraImports ?? []).map((i) =>
      i.startsWith("import ") ? i : `import ${i}`,
    ).join("\n");

    return template
      .replace("{{extra_imports}}", importBlock)
      .replace("{{proof}}", indentBlock(input.proof, 2));
  }

  throw new Error(`unknown proofKind: ${input.proofKind}`);
}

function failResult(
  error: string,
  elapsed: number,
  partial?: Partial<ProofVerifyResult["details"]>,
): ProofVerifyResult {
  return {
    score: 0,
    error,
    details: {
      user_ok: false,
      exact_ok: false,
      verify_ok: false,
      axioms_ok: false,
      answer_ok: false,
      has_sorry: false,
      is_trivial: false,
      bad_axioms: [],
      bad_answer_refs: [],
      elapsed_ms: elapsed,
      ...partial,
    },
  };
}

// ── LeanVerifier ────────────────────────────────────────────────────

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

  // ── Lean introspection helpers ──────────────────────────────────

  private async collectAxioms(
    declName: string,
    env: number,
  ): Promise<string[]> {
    const resp = await this.sendCmd(`#print axioms ${declName}`, env);
    const text = (resp.messages ?? []).map((m) => m.data ?? "").join("\n");
    return parseAxioms(text);
  }

  private async printDecl(declName: string, env: number): Promise<string> {
    const resp = await this.sendCmd(
      `set_option pp.all true in\n#print ${declName}`,
      env,
    );
    return (resp.messages ?? []).map((m) => m.data ?? "").join("\n");
  }

  // ── Legacy verification (old lean_code path) ───────────────────

  async verifyProof(
    leanCode: string,
    verifierJson: string,
  ): Promise<ProofVerifyResult> {
    const t0 = Date.now();
    const config: LegacyVerifierConfig = JSON.parse(verifierJson);
    const { extraImports, code } = parseImports(leanCode);

    let env = this.warmEnv;

    for (const imp of extraImports) {
      const resp = await this.sendCmd(imp, env);
      env = resp.env ?? env;
    }

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
      return failResult(`compilation_error: ${errors.slice(0, 500)}`, Date.now() - t0, {
        has_sorry: hasSorry,
      });
    }

    const verifyResp = await this.sendCmd(config.verifier, userEnv);
    const verifyMsgs = verifyResp.messages ?? [];
    const verifyOk = !verifyMsgs.some((m) => m.severity === "error");

    if (!verifyOk) {
      const errors = verifyMsgs
        .filter((m) => m.severity === "error")
        .map((m) => m.data)
        .join("; ");
      return failResult(`verification_failed: ${errors.slice(0, 500)}`, Date.now() - t0, {
        user_ok: true,
        has_sorry: hasSorry,
      });
    }

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
        exact_ok: true,
        verify_ok: verifyOk,
        axioms_ok: true,
        answer_ok: true,
        has_sorry: hasSorry,
        is_trivial: isTrivial,
        bad_axioms: [],
        bad_answer_refs: [],
        elapsed_ms: Date.now() - t0,
      },
    };
  }

  // ── Structured verification (trusted-wrapper path) ─────────────

  async verifyStructuredProof(
    input: StructuredProofInput,
  ): Promise<ProofVerifyResult> {
    const t0 = Date.now();
    const elapsed = () => Date.now() - t0;

    // ── 0. Validate imports against allowlist ─────────────────────
    const allowedPrefixes =
      input.allowedImportPrefixes ?? DEFAULT_ALLOWED_IMPORT_PREFIXES;
    const rawImports = (input.extraImports ?? []).map((i) =>
      i.startsWith("import ") ? i : `import ${i}`,
    );
    const importErr = validateImports(rawImports, allowedPrefixes);
    if (importErr) {
      return failResult(importErr, elapsed());
    }

    // ── 0b. Validate claim for claim_proof ───────────────────────
    if (input.proofKind === "claim_proof") {
      const allowed = input.allowedClaims ?? ["yes", "no"];
      if (!input.claim || !allowed.includes(input.claim)) {
        return failResult(
          `invalid claim: ${input.claim ?? "(missing)"}, allowed: ${allowed.join(", ")}`,
          elapsed(),
        );
      }
    }

    // ── 1. Build trusted Lean module ─────────────────────────────
    let leanModule: string;
    try {
      leanModule = buildLeanModule(input);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return failResult(`template_error: ${msg}`, elapsed());
    }

    console.log(`[lean] generated module (${leanModule.length} bytes)`);

    // ── 2. Compile in REPL ───────────────────────────────────────
    const { extraImports, code } = parseImports(leanModule);

    let env = this.warmEnv;
    for (const imp of extraImports) {
      const resp = await this.sendCmd(imp, env);
      env = resp.env ?? env;
      const impErrors = summarizeErrors(resp);
      if (impErrors) {
        return failResult(`import_error: ${impErrors}`, elapsed());
      }
    }

    const userResp = await this.sendCmd(code, env);
    const userEnv = userResp.env ?? env;
    const userOk = !summarizeErrors(userResp);
    const hasSorry = containsSorryText(userResp);

    if (!userOk) {
      return failResult(
        `compilation_error: ${summarizeErrors(userResp)}`,
        elapsed(),
        { has_sorry: hasSorry },
      );
    }

    // ── 3. Exact theorem-shape check ─────────────────────────────
    let exactOk = true;
    if (input.exactVerifier) {
      const resp = await this.sendCmd(input.exactVerifier, userEnv);
      exactOk = !summarizeErrors(resp);
      if (!exactOk) {
        return failResult(
          `exact_verification_failed: ${summarizeErrors(resp)}`,
          elapsed(),
          { user_ok: true, has_sorry: hasSorry },
        );
      }
    }

    // ── 4. Axiom audit ───────────────────────────────────────────
    const allowedAxioms = new Set(
      input.allowedAxioms ?? [...DEFAULT_ALLOWED_AXIOMS],
    );
    const badAxioms = new Set<string>();

    const declsToAudit = [input.theoremName, input.answerName].filter(
      Boolean,
    ) as string[];
    for (const declName of declsToAudit) {
      const axioms = await this.collectAxioms(declName, userEnv);
      for (const ax of axioms) {
        if (!allowedAxioms.has(ax)) badAxioms.add(ax);
      }
    }
    const axiomsOk = badAxioms.size === 0;

    if (!axiomsOk) {
      return failResult(
        `bad_axioms: ${[...badAxioms].join(", ")}`,
        elapsed(),
        {
          user_ok: true,
          exact_ok: exactOk,
          has_sorry: hasSorry,
          bad_axioms: [...badAxioms],
        },
      );
    }

    // ── 5. Answer dependency audit (transitive) ──────────────────
    let badAnswerRefs: string[] = [];
    if (
      input.answerName &&
      (input.forbiddenAnswerConsts?.length ?? 0) > 0
    ) {
      const printed = await this.printDecl(input.answerName, userEnv);
      const reachableConsts = parseConstants(printed);
      badAnswerRefs = input.forbiddenAnswerConsts!.filter((forbidden) =>
        reachableConsts.some(
          (c) => c === forbidden || c.endsWith("." + forbidden),
        ) || printed.includes(forbidden),
      );
    }
    const answerOk = badAnswerRefs.length === 0;

    if (!answerOk) {
      return failResult(
        `forbidden_answer_refs: ${badAnswerRefs.join(", ")}`,
        elapsed(),
        {
          user_ok: true,
          exact_ok: exactOk,
          axioms_ok: true,
          has_sorry: hasSorry,
          bad_answer_refs: badAnswerRefs,
        },
      );
    }

    // ── 6. Anti-triviality ───────────────────────────────────────
    let isTrivial = false;
    if (input.antitrivial) {
      const resp = await this.sendCmd(input.antitrivial, userEnv);
      isTrivial = !summarizeErrors(resp);
    }

    // ── 7. Final verdict ─────────────────────────────────────────
    const valid =
      exactOk && axiomsOk && answerOk && !hasSorry && !isTrivial;

    let error: string | undefined;
    if (hasSorry) error = "proof uses sorry";
    else if (isTrivial) error = "trivial self-referential answer";

    return {
      score: valid ? 1 : 0,
      error,
      details: {
        user_ok: true,
        exact_ok: exactOk,
        verify_ok: true,
        axioms_ok: axiomsOk,
        answer_ok: answerOk,
        has_sorry: hasSorry,
        is_trivial: isTrivial,
        bad_axioms: [...badAxioms],
        bad_answer_refs: badAnswerRefs,
        elapsed_ms: elapsed(),
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
