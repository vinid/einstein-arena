import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Together from "together-ai";
import { getRedis } from "@/lib/redis";
import { DEFAULT_MIN_IMPROVEMENT } from "@/lib/problems";

const MAX_PER_BATCH = 30;
const TOP_N = 100;
const METRICS_TTL = 48 * 60 * 60;

interface Problem {
  slug: string;
  scoring: string;
  minImprovement: number;
  verifier: string;
}

function evalHourKey() {
  return `metrics:eval:${new Date().toISOString().slice(0, 13)}`;
}

function isBetter(newScore: number, oldScore: number, scoring: string): boolean {
  return scoring === "minimize" ? newScore < oldScore : newScore > oldScore;
}

function clearance(newScore: number, oldScore: number, scoring: string): number {
  return scoring === "minimize" ? oldScore - newScore : newScore - oldScore;
}

function parseVerifierOutput(
  response: { data?: { outputs?: { type: string; data: unknown }[] }; errors?: unknown }
): { score?: number; error?: string } {
  const errors = (response as unknown as { errors?: unknown }).errors;
  if (errors) {
    return { error: typeof errors === "string" ? errors : JSON.stringify(errors) };
  }

  const outputs = response.data?.outputs || [];
  for (const output of outputs) {
    if (output.type === "stderr" && output.data) {
      const stderr = String(output.data);
      if (stderr.includes("Error") || stderr.includes("raise")) {
        return { error: stderr.trim().split("\n").pop() || stderr };
      }
    }
    if (output.type === "stdout" && typeof output.data === "string") {
      const match = output.data.match(/SCORE:([\d.eE+-]+)/);
      if (match) return { score: parseFloat(match[1]) };
    }
  }

  const allOutput = outputs.map((o) => `${o.type}: ${o.data}`).join("\n");
  return { error: `No score returned. Output: ${allOutput.slice(0, 500)}` };
}

async function evalInSession(
  together: Together,
  sessionId: string,
  verifierCode: string,
  solutionData: Record<string, unknown>
): Promise<{ score?: number; error?: string }> {
  const dataJson = JSON.stringify(solutionData);
  const execStart = Date.now();

  const response = await together.codeInterpreter.execute({
    code: `import json\n${verifierCode}\nwith open('data.json') as f:\n    data = json.load(f)\nscore = evaluate(data)\nprint(f"SCORE:{score}")`,
    language: "python",
    session_id: sessionId,
    files: [{ name: "data.json", content: dataJson, encoding: "string" as const }],
  });

  const execMs = Date.now() - execStart;
  const pipe = getRedis().pipeline();
  const hk = evalHourKey();
  pipe.hincrby(hk, "executions", 1);
  pipe.hincrby(hk, "exec_latency_sum", execMs);
  pipe.hincrby(hk, "exec_bytes", dataJson.length);
  pipe.expire(hk, METRICS_TTL);
  pipe.exec();

  return parseVerifierOutput(response as { data?: { outputs?: { type: string; data: unknown }[] }; errors?: unknown });
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

async function countEvaluated(problemId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")));
  return rows[0]?.n ?? 0;
}

async function pruneWorst(problemId: number, scoring: string) {
  const order = scoring === "minimize"
    ? sql`${solutions.score} desc`
    : sql`${solutions.score} asc`;

  const worst = await db
    .select({ id: solutions.id })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")))
    .orderBy(order)
    .limit(1);

  if (worst.length) {
    await db.delete(solutions).where(eq(solutions.id, worst[0].id));
  }
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

type Disposition = "accepted" | "new_first" | "rejected_min_improvement" | "discarded_personal" | "error";

async function decide(
  score: number,
  problemId: number,
  agentName: string,
  problem: Problem
): Promise<{ disposition: Disposition; globalBest: number | null; agentBest: { id: number; score: number } | null }> {
  const globalBest = await getGlobalBest(problemId, problem.scoring);
  const agentBest = await getAgentBest(problemId, agentName, problem.scoring);
  const wouldBeFirst = globalBest === null || isBetter(score, globalBest, problem.scoring);

  if (wouldBeFirst) {
    if (globalBest !== null && clearance(score, globalBest, problem.scoring) < problem.minImprovement) {
      return { disposition: "rejected_min_improvement", globalBest, agentBest };
    }
    return { disposition: "new_first", globalBest, agentBest };
  }

  if (agentBest && !isBetter(score, agentBest.score, problem.scoring)) {
    return { disposition: "discarded_personal", globalBest, agentBest };
  }

  return { disposition: "accepted", globalBest, agentBest };
}

async function processSolution(
  sol: SolutionRow,
  problem: Problem,
  together: Together,
  sessionId: string
) {
  const t = Date.now();

  const result = await evalInSession(together, sessionId, problem.verifier, sol.data as Record<string, unknown>);
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
      if (agentBest) await deleteSolution(agentBest.id);

      const total = await countEvaluated(sol.problemId);
      if (total > TOP_N) await pruneWorst(sol.problemId, problem.scoring);

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

async function initSession(together: Together) {
  const t0 = Date.now();
  const resp = await together.codeInterpreter.execute({
    code: "import json\nprint('ready')",
    language: "python",
  });
  const ms = Date.now() - t0;
  const sessionId = resp.data!.session_id;
  console.log(`[eval] session ${sessionId} created (${ms}ms)`);

  const pipe = getRedis().pipeline();
  const hk = evalHourKey();
  pipe.hincrby(hk, "sessions", 1);
  pipe.hincrby(hk, "session_latency_sum", ms);
  pipe.expire(hk, METRICS_TTL);
  pipe.exec();

  return sessionId;
}

async function loadProblem(problemId: number, cache: Record<number, Problem>): Promise<Problem> {
  if (cache[problemId]) return cache[problemId];

  const rows = await db
    .select({
      slug: problems.slug,
      scoring: problems.scoring,
      minImprovement: problems.minImprovement,
      verifier: problems.verifier,
    })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  cache[problemId] = rows[0];
  return rows[0];
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await db
    .select()
    .from(solutions)
    .where(eq(solutions.status, "pending"))
    .limit(MAX_PER_BATCH);

  if (pending.length === 0) {
    console.log("[eval] no pending solutions, skipping");
    return NextResponse.json({ evaluated: 0, pending: 0 });
  }

  console.log(`[eval] starting batch: ${pending.length} pending solutions`);

  const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });
  const sessionId = await initSession(together);
  const problemCache: Record<number, Problem> = {};

  let evaluated = 0;
  const t0 = Date.now();

  for (const sol of pending) {
    try {
      const problem = await loadProblem(sol.problemId, problemCache);
      await processSolution(sol, problem, together, sessionId);
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
}
