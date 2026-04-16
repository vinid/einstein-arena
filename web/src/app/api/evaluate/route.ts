import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { Sandbox, type Context } from "@e2b/code-interpreter";
import { getRedis } from "@/lib/redis";
import { DEFAULT_MIN_IMPROVEMENT, PROBLEMS } from "@/lib/problems";
import { scoreOrder } from "@/lib/problem-utils";
import { randomUUID } from "crypto";
import { type Disposition, isBetter, clearance, decideDisposition } from "@/lib/evaluate";
import { LeanVerifier, type StructuredProofInput } from "@/lib/lean-verify";
import type { ProblemDef } from "@/lib/problems/types";

const problemDefsBySlug: Record<string, ProblemDef> = Object.fromEntries(
  PROBLEMS.map((p) => [p.slug, p]),
);

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
  const rows = await db
    .select({ id: solutions.id, score: solutions.score })
    .from(solutions)
    .where(and(
      eq(solutions.problemId, problemId),
      eq(solutions.agentName, agentName),
      eq(solutions.status, "evaluated"),
    ))
    .orderBy(scoreOrder(scoring, solutions.score))
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

async function processProofSolution(
  sol: SolutionRow,
  problem: Problem,
  leanVerifier: LeanVerifier,
) {
  const t = Date.now();
  const data = sol.data as Record<string, unknown>;
  const def = problemDefsBySlug[problem.slug];

  // Use the new structured path when the problem defines proofKind
  if (def?.proofKind) {
    const input: StructuredProofInput = {
      proofKind: def.proofKind,
      proof: data.proof as string,
      answerExpr: data.answer_expr as string | undefined,
      claim: data.claim as string | undefined,
      extraImports: data.extra_imports as string[] | undefined,
      leanTemplate: def.leanTemplate,
      leanTemplateYes: def.leanTemplateYes,
      leanTemplateNo: def.leanTemplateNo,
      theoremName: def.theoremName,
      answerName: def.answerName,
      exactVerifier: def.exactVerifier,
      forbiddenAnswerConsts: def.forbiddenAnswerConsts,
      allowedAxioms: def.allowedAxioms,
      allowedImportPrefixes: def.allowedImportPrefixes,
      allowedClaims: def.allowedClaims,
      antitrivial: def.antitrivial,
    };

    const result = await leanVerifier.verifyStructuredProof(input);
    const ms = Date.now() - t;

    const pipe = getRedis().pipeline();
    const hk = evalHourKey();
    pipe.hincrby(hk, "executions", 1);
    pipe.hincrby(hk, "exec_latency_sum", ms);
    pipe.hincrby(hk, "exec_bytes", (data.proof as string ?? "").length + (data.answer_expr as string ?? "").length);
    pipe.expire(hk, METRICS_TTL);
    pipe.exec();

    if (result.score === 0) {
      log(sol.id, sol.agentName, problem.slug, ms, `PROOF_REJECTED: ${(result.error ?? "unknown").slice(0, 200)}`);
      await markError(sol.id, result.error ?? "proof verification failed");
      return;
    }

    await markEvaluated(sol.id, 1);
    log(sol.id, sol.agentName, problem.slug, ms, "PROVED");
    return;
  }

  // Legacy path: raw lean_code
  const leanCode = data.lean_code as string | undefined;

  if (!leanCode) {
    log(sol.id, sol.agentName, problem.slug, 0, "ERROR: missing lean_code");
    await markError(sol.id, "missing lean_code in solution data");
    return;
  }

  const result = await leanVerifier.verifyProof(leanCode, problem.verifier);
  const ms = Date.now() - t;

  const pipe = getRedis().pipeline();
  const hk = evalHourKey();
  pipe.hincrby(hk, "executions", 1);
  pipe.hincrby(hk, "exec_latency_sum", ms);
  pipe.hincrby(hk, "exec_bytes", leanCode.length);
  pipe.expire(hk, METRICS_TTL);
  pipe.exec();

  if (result.score === 0) {
    log(sol.id, sol.agentName, problem.slug, ms, `PROOF_REJECTED: ${(result.error ?? "unknown").slice(0, 200)}`);
    await markError(sol.id, result.error ?? "proof verification failed");
    return;
  }

  await markEvaluated(sol.id, 1);
  log(sol.id, sol.agentName, problem.slug, ms, "PROVED");
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
  let ctx: Context | null = null;
  let leanVerifier: LeanVerifier | null = null;
  try {
    const problemCache: Record<number, Problem> = {};
    const t0 = Date.now();
    let evaluated = 0;

    // Resolve problems and split into two queues
    const constructions: typeof pending = [];
    const proofs: typeof pending = [];
    for (const sol of pending) {
      const problem = await loadProblem(sol.problemId, problemCache);
      if (!problem) {
        await markError(sol.id, "problem is hidden");
        evaluated++;
        continue;
      }
      if (problem.evaluationMode === "proof") {
        proofs.push(sol);
      } else {
        constructions.push(sol);
      }
    }

    // Pass 1 — construction problems (Python sandbox)
    if (constructions.length > 0) {
      const init = await initSandbox();
      sbx = init.sbx;
      ctx = init.ctx;
      for (const sol of constructions) {
        try {
          const problem = problemCache[sol.problemId]!;
          await processSolution(sol, problem, sbx, ctx);
          await sbx.restartCodeContext(ctx);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[eval] sol=${sol.id} agent=${sol.agentName} EXCEPTION: ${msg}`);
          await markError(sol.id, msg);
        }
        evaluated++;
      }
      await sbx.kill();
      sbx = null;
    }

    // Pass 2 — proof problems (Lean verifier)
    if (proofs.length > 0) {
      let leanInitFailed = false;
      try {
        const v = new LeanVerifier();
        await v.init();
        leanVerifier = v;
      } catch (e: unknown) {
        leanInitFailed = true;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[eval] LEAN_INIT_FAILED: ${msg}`);
        for (const sol of proofs) {
          await markError(sol.id, `lean_verifier_unavailable: ${msg.slice(0, 300)}`);
          evaluated++;
        }
      }
      if (!leanInitFailed && leanVerifier) {
        for (const sol of proofs) {
          try {
            const problem = problemCache[sol.problemId]!;
            await processProofSolution(sol, problem, leanVerifier);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[eval] sol=${sol.id} agent=${sol.agentName} EXCEPTION: ${msg}`);
            await markError(sol.id, msg);
          }
          evaluated++;
        }
      }
    }

    const totalMs = Date.now() - t0;
    console.log(`[eval] batch done: ${evaluated}/${pending.length} in ${totalMs}ms (avg ${Math.round(totalMs / Math.max(evaluated, 1))}ms/sol)`);
    return NextResponse.json({ evaluated, pending: pending.length });
  } finally {
    if (sbx) await sbx.kill();
    if (leanVerifier) await leanVerifier.close();
    await releaseEvaluateLock(lockValue);
  }
}
