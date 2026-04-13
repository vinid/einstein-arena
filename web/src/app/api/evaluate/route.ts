import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { Sandbox, type Context } from "@e2b/code-interpreter";
import { getRedis } from "@/lib/redis";
import { DEFAULT_MIN_IMPROVEMENT } from "@/lib/problems";
import { randomUUID } from "crypto";
import { type Disposition, isBetter, clearance, decideDisposition } from "@/lib/evaluate";

const MAX_PER_BATCH = 30;
const METRICS_TTL = 48 * 60 * 60;
const EVALUATE_LOCK_KEY = "locks:evaluate";
const EVALUATE_LOCK_TTL_SECONDS = 14 * 60;
const VERIFIER_TIMEOUT_MS = 120_000;

interface Problem {
  slug: string;
  scoring: string;
  minImprovement: number;
  evaluationMode: string;
  verifier: string;
}

function evalHourKey() {
  return `metrics:eval:${new Date().toISOString().slice(0, 13)}`;
}

function parseVerifierOutput(
  exec: { logs: { stdout: string[]; stderr: string[] }; error?: { name: string; value: string; traceback: string } | null }
): { score?: number; error?: string } {
  if (exec.error) {
    const tb = exec.error.traceback.slice(0, 500);
    return { error: `runtime_error: ${exec.error.value}\n${tb}` };
  }

  const stderr = exec.logs.stderr.join("\n");
  if (stderr && (stderr.includes("Error") || stderr.includes("raise"))) {
    return { error: stderr.trim().split("\n").pop() || stderr };
  }

  const stdout = exec.logs.stdout.join("\n");
  const match = stdout.match(/SCORE:(-?inf|-?nan|[\d.eE+-]+)/i);
  if (match) {
    const raw = match[1].toLowerCase().replace("inf", "Infinity");
    const score = parseFloat(raw);
    if (!isFinite(score)) return { error: `verifier returned non-finite score: ${match[1]}` };
    return { score };
  }

  return { error: `No score returned. stdout: ${stdout.slice(0, 300)} stderr: ${stderr.slice(0, 200)}` };
}

async function evalInSandbox(
  sbx: Sandbox,
  ctx: Context,
  verifierCode: string,
  solutionData: Record<string, unknown>,
  solId?: number,
  slug?: string
): Promise<{ score?: number; error?: string }> {
  const dataJson = JSON.stringify(solutionData);
  const execStart = Date.now();

  const code = `import json\n${verifierCode}\ndata = json.loads(${JSON.stringify(dataJson)})\nscore = evaluate(data)\nprint(f"SCORE:{score}")`;

  let exec: Awaited<ReturnType<typeof sbx.runCode>>;
  try {
    exec = await sbx.runCode(code, { context: ctx, timeoutMs: VERIFIER_TIMEOUT_MS, requestTimeoutMs: VERIFIER_TIMEOUT_MS });
  } catch (e: unknown) {
    const execMs = Date.now() - execStart;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[eval] sol=${solId} problem=${slug} E2B_SDK_ERROR bytes=${dataJson.length} (${execMs}ms): ${msg.slice(0, 1000)}`);
    return { error: msg.slice(0, 500) };
  }

  const execMs = Date.now() - execStart;
  const pipe = getRedis().pipeline();
  const hk = evalHourKey();
  pipe.hincrby(hk, "executions", 1);
  pipe.hincrby(hk, "exec_latency_sum", execMs);
  pipe.hincrby(hk, "exec_bytes", dataJson.length);
  pipe.expire(hk, METRICS_TTL);
  pipe.exec();

  const parsed = parseVerifierOutput(exec);
  if (parsed.error) {
    const rawStdout = exec.logs.stdout.join("\n").slice(0, 500);
    const rawStderr = exec.logs.stderr.join("\n").slice(0, 500);
    console.error(`[eval] sol=${solId} problem=${slug} VERIFIER_ERROR bytes=${dataJson.length} (${execMs}ms) error=${parsed.error.slice(0, 300)} stdout=${rawStdout} stderr=${rawStderr}`);
  }
  return parsed;
}

async function getGlobalBest(problemId: number, scoring: string): Promise<number | null> {
  const agg = scoring === "minimize"
    ? sql<number>`min(${solutions.score})`
    : sql<number>`max(${solutions.score})`;

  const rows = await db
    .select({ best: agg })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")));

  return rows[0]?.best ?? null;
}

async function getAgentBest(
  problemId: number,
  agentName: string,
  scoring: string
): Promise<{ id: number; score: number } | null> {
  const order = scoring === "minimize"
    ? sql`${solutions.score} asc`
    : sql`${solutions.score} desc`;

  const rows = await db
    .select({ id: solutions.id, score: solutions.score })
    .from(solutions)
    .where(and(
      eq(solutions.problemId, problemId),
      eq(solutions.agentName, agentName),
      eq(solutions.status, "evaluated"),
    ))
    .orderBy(order)
    .limit(1);

  if (!rows.length || rows[0].score === null) return null;
  return { id: rows[0].id, score: rows[0].score! };
}


function log(solId: number, agent: string, slug: string, ms: number, msg: string) {
  console.log(`[eval] sol=${solId} agent=${agent} problem=${slug} ${msg} (${ms}ms)`);
}

async function deleteSolution(id: number) {
  await db.delete(solutions).where(eq(solutions.id, id));
}

async function markError(id: number, error: string) {
  await db
    .update(solutions)
    .set({ status: "error", error, evaluatedAt: new Date() })
    .where(eq(solutions.id, id));
}

async function markEvaluated(id: number, score: number) {
  await db
    .update(solutions)
    .set({ status: "evaluated", score, evaluatedAt: new Date() })
    .where(eq(solutions.id, id));
}

async function decide(
  score: number,
  problemId: number,
  agentName: string,
  problem: Problem
): Promise<{ disposition: Disposition; globalBest: number | null; agentBest: { id: number; score: number } | null }> {
  const globalBest = await getGlobalBest(problemId, problem.scoring);
  const agentBest = await getAgentBest(problemId, agentName, problem.scoring);
  return { disposition: decideDisposition(score, globalBest, agentBest, problem), globalBest, agentBest };
}

async function processSolution(
  sol: SolutionRow,
  problem: Problem,
  sbx: Sandbox,
  ctx: Context
) {
  const t = Date.now();

  const result = await evalInSandbox(sbx, ctx, problem.verifier, sol.data as Record<string, unknown>, sol.id, problem.slug);
  const ms = Date.now() - t;

  if (result.error) {
    log(sol.id, sol.agentName, problem.slug, ms, `ERROR: ${result.error.slice(0, 200)}`);
    await markError(sol.id, result.error);
    return;
  }

  const score = result.score!;
  const { disposition, agentBest } = await decide(score, sol.problemId, sol.agentName, problem);

  switch (disposition) {
    case "rejected_min_improvement":
      log(sol.id, sol.agentName, problem.slug, ms, `REJECTED score=${score} below minImprovement`);
      await deleteSolution(sol.id);
      return;

    case "discarded_personal":
      log(sol.id, sol.agentName, problem.slug, ms, `DISCARDED score=${score} worse than personal best=${agentBest!.score}`);
      await deleteSolution(sol.id);
      return;

    case "new_first":
    case "accepted": {
      await markEvaluated(sol.id, score);
      log(sol.id, sol.agentName, problem.slug, ms, `score=${score} ${disposition === "new_first" ? "NEW #1" : "accepted"}`);
      return;
    }
  }
}

type SolutionRow = {
  id: number;
  problemId: number;
  agentName: string;
  status: string;
  data: unknown;
  code: string | null;
  score: number | null;
  error: string | null;
  createdAt: Date;
  evaluatedAt: Date | null;
};

async function initSandbox(): Promise<{ sbx: Sandbox; ctx: Context }> {
  const t0 = Date.now();
  const sbx = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: EVALUATE_LOCK_TTL_SECONDS * 1000,
  });
  const ctx = await sbx.createCodeContext();
  const ms = Date.now() - t0;
  console.log(`[eval] sandbox ${sbx.sandboxId} + context ready (${ms}ms)`);

  const pipe = getRedis().pipeline();
  const hk = evalHourKey();
  pipe.hincrby(hk, "sessions", 1);
  pipe.hincrby(hk, "session_latency_sum", ms);
  pipe.expire(hk, METRICS_TTL);
  pipe.exec();

  return { sbx, ctx };
}

async function loadProblem(problemId: number, cache: Record<number, Problem>): Promise<Problem | null> {
  if (cache[problemId]) return cache[problemId];

  const rows = await db
    .select({
      slug: problems.slug,
      scoring: problems.scoring,
      minImprovement: problems.minImprovement,
      evaluationMode: problems.evaluationMode,
      verifier: problems.verifier,
      hidden: problems.hidden,
    })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (!rows[0] || rows[0].hidden) return null;

  cache[problemId] = rows[0];
  return rows[0];
}

async function releaseEvaluateLock(lockValue: string) {
  await getRedis().eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    EVALUATE_LOCK_KEY,
    lockValue
  );
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  const lockValue = randomUUID();
  const locked = await redis.set(EVALUATE_LOCK_KEY, lockValue, "EX", EVALUATE_LOCK_TTL_SECONDS, "NX");

  if (locked !== "OK") {
    console.log("[eval] skipping: previous batch still running");
    return NextResponse.json({ skipped: true, reason: "already_running" });
  }

  const pending = await db
    .select()
    .from(solutions)
    .where(eq(solutions.status, "pending"))
    .limit(MAX_PER_BATCH);

  if (pending.length === 0) {
    await releaseEvaluateLock(lockValue);
    console.log("[eval] no pending solutions, skipping");
    return NextResponse.json({ evaluated: 0, pending: 0 });
  }

  console.log(`[eval] starting batch: ${pending.length} pending solutions`);

  let sbx: Sandbox | null = null;
  try {
    const { sbx: sandbox, ctx } = await initSandbox();
    sbx = sandbox;
    const problemCache: Record<number, Problem> = {};

    let evaluated = 0;
    const t0 = Date.now();

    for (const sol of pending) {
      try {
        const problem = await loadProblem(sol.problemId, problemCache);
        if (!problem) {
          await markError(sol.id, "problem is hidden");
          evaluated++;
          continue;
        }
        await processSolution(sol, problem, sbx, ctx);
        await sbx.restartCodeContext(ctx);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[eval] sol=${sol.id} agent=${sol.agentName} EXCEPTION: ${msg}`);
        await markError(sol.id, msg);
      }
      evaluated++;
    }

    const totalMs = Date.now() - t0;
    console.log(`[eval] batch done: ${evaluated}/${pending.length} in ${totalMs}ms (avg ${Math.round(totalMs / evaluated)}ms/sol)`);
    return NextResponse.json({ evaluated, pending: pending.length });
  } finally {
    if (sbx) await sbx.kill();
    await releaseEvaluateLock(lockValue);
  }
}
