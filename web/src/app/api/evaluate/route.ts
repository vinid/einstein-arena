import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Together from "together-ai";

const MAX_PER_BATCH = 30;

function getTogether() {
  return new Together({ apiKey: process.env.TOGETHER_API_KEY });
}

function parseVerifierOutput(
  response: { data?: { outputs?: { type: string; data: unknown }[] }; errors?: unknown }
): { score?: number; error?: string } {
  const outputs = response.data?.outputs || [];
  const responseErrors = (response as unknown as { errors?: unknown }).errors;

  if (responseErrors) {
    return { error: typeof responseErrors === "string" ? responseErrors : JSON.stringify(responseErrors) };
  }

  for (const output of outputs) {
    if (output.type === "stderr" && output.data) {
      const stderr = String(output.data);
      if (stderr.includes("Error") || stderr.includes("raise")) {
        const lastLine = stderr.trim().split("\n").pop() || stderr;
        return { error: lastLine };
      }
    }
    if (output.type === "stdout" && typeof output.data === "string") {
      const match = output.data.match(/SCORE:([\d.eE+-]+)/);
      if (match) {
        return { score: parseFloat(match[1]) };
      }
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

  const response = await together.codeInterpreter.execute({
    code: `import json\n${verifierCode}\nwith open('data.json') as f:\n    data = json.load(f)\nscore = evaluate(data)\nprint(f"SCORE:{score}")`,
    language: "python",
    session_id: sessionId,
    files: [{ name: "data.json", content: dataJson, encoding: "string" as const }],
  });

  return parseVerifierOutput(response as { data?: { outputs?: { type: string; data: unknown }[] }; errors?: unknown });
}

const TOP_N = 100;

function isBetter(newScore: number, oldScore: number, scoring: string): boolean {
  return scoring === "minimize" ? newScore < oldScore : newScore > oldScore;
}

async function getGlobalBest(
  problemId: number,
  scoring: string
): Promise<number | null> {
  const agg =
    scoring === "minimize"
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

async function pruneWorstAgent(problemId: number, scoring: string) {
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

async function countEvaluated(problemId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")));
  return rows[0]?.n ?? 0;
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

  const problemCache: Record<
    number,
    { slug: string; scoring: string; minImprovement: number; verifier: string }
  > = {};

  let evaluated = 0;
  const together = getTogether();

  const t0 = Date.now();
  const initResp = await together.codeInterpreter.execute({
    code: "import json\nprint('ready')",
    language: "python",
  });
  const sessionId = initResp.data!.session_id;
  console.log(`[eval] session ${sessionId} created (${Date.now() - t0}ms)`);

  for (const sol of pending) {
    let problem = problemCache[sol.problemId];
    if (!problem) {
      const rows = await db
        .select({
          slug: problems.slug,
          scoring: problems.scoring,
          minImprovement: problems.minImprovement,
          verifier: problems.verifier,
        })
        .from(problems)
        .where(eq(problems.id, sol.problemId))
        .limit(1);
      problem = rows[0];
      problemCache[sol.problemId] = problem;
    }

    const solStart = Date.now();
    try {
      const result = await evalInSession(
        together,
        sessionId,
        problem.verifier,
        sol.data as Record<string, unknown>
      );
      const evalMs = Date.now() - solStart;

      if (result.error) {
        console.log(`[eval] sol=${sol.id} agent=${sol.agentName} problem=${problem.slug} ERROR (${evalMs}ms): ${result.error.slice(0, 200)}`);
        await db
          .update(solutions)
          .set({ status: "error", error: result.error, evaluatedAt: new Date() })
          .where(eq(solutions.id, sol.id));
        evaluated++;
        continue;
      }

      const score = result.score!;

      const globalBest = await getGlobalBest(sol.problemId, problem.scoring);
      const wouldBeFirst = globalBest === null || isBetter(score, globalBest, problem.scoring);

      if (wouldBeFirst && globalBest !== null) {
        const clearance = problem.scoring === "minimize"
          ? globalBest - score
          : score - globalBest;
        if (clearance < problem.minImprovement) {
          console.log(`[eval] sol=${sol.id} agent=${sol.agentName} problem=${problem.slug} REJECTED score=${score} below minImprovement (${evalMs}ms)`);
          await db.delete(solutions).where(eq(solutions.id, sol.id));
          evaluated++;
          continue;
        }
      }

      const agentBest = await getAgentBest(sol.problemId, sol.agentName, problem.scoring);

      if (!wouldBeFirst && agentBest && !isBetter(score, agentBest.score, problem.scoring)) {
        console.log(`[eval] sol=${sol.id} agent=${sol.agentName} problem=${problem.slug} DISCARDED score=${score} worse than personal best=${agentBest.score} (${evalMs}ms)`);
        await db.delete(solutions).where(eq(solutions.id, sol.id));
        evaluated++;
        continue;
      }

      await db
        .update(solutions)
        .set({ status: "evaluated", score, evaluatedAt: new Date() })
        .where(eq(solutions.id, sol.id));

      if (agentBest) {
        await db.delete(solutions).where(eq(solutions.id, agentBest.id));
      }

      const total = await countEvaluated(sol.problemId);
      if (total > TOP_N) {
        await pruneWorstAgent(sol.problemId, problem.scoring);
      }

      console.log(`[eval] sol=${sol.id} agent=${sol.agentName} problem=${problem.slug} score=${score} ${wouldBeFirst ? "NEW #1" : "accepted"} (${evalMs}ms)`);
      evaluated++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const evalMs = Date.now() - solStart;
      console.error(`[eval] sol=${sol.id} agent=${sol.agentName} problem=${problem.slug} EXCEPTION (${evalMs}ms): ${msg}`);
      await db
        .update(solutions)
        .set({ status: "error", error: msg, evaluatedAt: new Date() })
        .where(eq(solutions.id, sol.id));
      evaluated++;
    }
  }

  const totalMs = Date.now() - t0;
  console.log(`[eval] batch done: ${evaluated}/${pending.length} evaluated in ${totalMs}ms (avg ${Math.round(totalMs / evaluated)}ms/sol)`);
  return NextResponse.json({ evaluated, pending: pending.length });
}
