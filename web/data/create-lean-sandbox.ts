import { Sandbox } from "e2b";

const LEAN_TEMPLATE = "lean-formal-conjectures-v4-28";
const PROJ_DIR = "/home/user/formal-conjectures";
const REPL_DIR = "/home/user/repl";
const USER_LAKE = "/home/user/.elan/bin/lake";
const REPL_START_CMD = `cd ${PROJ_DIR} && ${USER_LAKE} env ${REPL_DIR}/.lake/build/bin/repl`;
const WARM_IMPORT = "import FormalConjectures.Util.ProblemImports";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  if (!process.env.E2B_API_KEY) {
    console.error("E2B_API_KEY is not set");
    process.exit(1);
  }

  console.log("Creating sandbox from template...");
  const sbx = await Sandbox.create(LEAN_TEMPLATE, {
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: 900_000,
    lifecycle: {
      onTimeout: "pause",
    },
  });
  console.log(`Sandbox created: ${sbx.sandboxId}`);

  console.log("Starting REPL...");
  try {
    await sbx.commands.run("pkill -f repl", { timeoutMs: 5_000 });
  } catch {}
  await sleep(2_000);

  await sbx.commands.run(REPL_START_CMD, { background: true, stdin: true });
  await sleep(2_000);

  const procs = await sbx.commands.list();
  const replProc = procs.find(
    (p) => (p.cmd ?? "").includes("repl") || p.args.some((a) => a.includes("repl")),
  );
  if (!replProc) throw new Error("REPL process not found");
  const pid = replProc.pid;
  console.log(`REPL pid: ${pid}`);

  let buffer = "";
  let pendingResolve: ((s: string) => void) | null = null;

  await sbx.commands.connect(pid, {
    onStdout: (data: string) => {
      buffer += data;
      if (!pendingResolve) return;
      try {
        JSON.parse(buffer.trim());
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(buffer.trim());
        buffer = "";
      } catch {}
    },
  });

  function sendCmd(cmd: string, env?: number, timeoutMs = 300_000): Promise<string> {
    buffer = "";
    return new Promise((resolve, reject) => {
      pendingResolve = resolve;
      const timer = setTimeout(() => {
        pendingResolve = null;
        reject(new Error(`REPL timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const obj: Record<string, unknown> = { cmd };
      if (env !== undefined) obj.env = env;
      sbx.commands.sendStdin(pid, JSON.stringify(obj) + "\n\n").then(() => {
        clearTimeout(timer);
      });
    });
  }

  console.log("Warming REPL (loading Mathlib — this takes ~5 min on a cold sandbox)...");
  const t0 = Date.now();
  const warmResp = await sendCmd(WARM_IMPORT);
  const parsed = JSON.parse(warmResp);
  const warmEnv = parsed.env ?? 0;
  const errors = (parsed.messages ?? []).filter((m: { severity?: string }) => m.severity === "error");
  if (errors.length > 0) {
    console.error("Warm import failed:", errors.map((e: { data?: string }) => e.data).join("; "));
    await sbx.kill();
    process.exit(1);
  }
  console.log(`REPL warmed in ${((Date.now() - t0) / 1000).toFixed(0)}s (env=${warmEnv})`);

  console.log("Pausing sandbox...");
  await sbx.pause();

  console.log("\n✓ Sandbox ready. Add this to your environment:\n");
  console.log(`  LEAN_WARM_SANDBOX_ID=${sbx.sandboxId}`);
  console.log("\nResume takes ~1s. The sandbox auto-pauses when idle.");
})();
