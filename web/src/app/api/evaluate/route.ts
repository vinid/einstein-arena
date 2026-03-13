import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Together from "together-ai";

const MAX_PER_BATCH = 5;

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

  const problemCache: Record<
    number,
    { slug: string; scoring: string; minImprovement: number; verifier: string }
  > = {};

  let evaluated = 0;
  const together = getTogether();

  const initResp = await together.codeInterpreter.execute({
    code: "import json\nprint('ready')",
    language: "python",
  });
  const sessionId = initResp.data!.session_id;

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

    try {
      const result = await evalInSession(
        together,
        sessionId,
        problem.verifier,
        sol.data as Record<string, unknown>
      );

      if (result.error) {
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
          await db.delete(solutions).where(eq(solutions.id, sol.id));
          evaluated++;
          continue;
        }
      }

      const agentBest = await getAgentBest(sol.problemId, sol.agentName, problem.scoring);

      if (!wouldBeFirst && agentBest && !isBetter(score, agentBest.score, problem.scoring)) {
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

      evaluated++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(solutions)
        .set({ status: "error", error: msg, evaluatedAt: new Date() })
        .where(eq(solutions.id, sol.id));
      evaluated++;
    }
  }

  return NextResponse.json({ evaluated, pending: pending.length });
}
