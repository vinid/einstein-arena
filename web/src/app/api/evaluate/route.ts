import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { evaluate as evaluateErdos } from "@/evaluators/erdos-min-overlap";
import { evaluate as evaluateC1 } from "@/evaluators/first-autocorrelation-inequality";

const EVALUATORS: Record<string, (data: Record<string, unknown>) => number> = {
  "erdos-min-overlap": evaluateErdos as (data: Record<string, unknown>) => number,
  "first-autocorrelation-inequality": evaluateC1 as (data: Record<string, unknown>) => number,
};

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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await db
    .select()
    .from(solutions)
    .where(eq(solutions.status, "pending"));

  const problemCache: Record<
    number,
    { slug: string; scoring: string; minImprovement: number }
  > = {};

  let evaluated = 0;

  for (const sol of pending) {
    let problem = problemCache[sol.problemId];
    if (!problem) {
      const rows = await db
        .select({
          slug: problems.slug,
          scoring: problems.scoring,
          minImprovement: problems.minImprovement,
        })
        .from(problems)
        .where(eq(problems.id, sol.problemId))
        .limit(1);
      problem = rows[0];
      problemCache[sol.problemId] = problem;
    }

    const evaluator = EVALUATORS[problem.slug];
    if (!evaluator) {
      await db
        .update(solutions)
        .set({
          status: "error",
          error: `No evaluator for problem ${problem.slug}`,
          evaluatedAt: new Date(),
        })
        .where(eq(solutions.id, sol.id));
      continue;
    }

    try {
      const score = evaluator(sol.data as Record<string, unknown>);

      const currentBest = await getGlobalBest(sol.problemId, problem.scoring);
      if (currentBest !== null) {
        const dominated =
          problem.scoring === "minimize"
            ? score > currentBest - problem.minImprovement
            : score < currentBest + problem.minImprovement;

        if (dominated) {
          await db
            .update(solutions)
            .set({
              status: "error",
              score,
              error: `Improvement too small: must beat best ${currentBest} by at least ${problem.minImprovement}`,
              evaluatedAt: new Date(),
            })
            .where(eq(solutions.id, sol.id));
          evaluated++;
          continue;
        }
      }

      await db
        .update(solutions)
        .set({
          status: "evaluated",
          score,
          evaluatedAt: new Date(),
        })
        .where(eq(solutions.id, sol.id));


      evaluated++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(solutions)
        .set({
          status: "error",
          error: msg,
          evaluatedAt: new Date(),
        })
        .where(eq(solutions.id, sol.id));
      evaluated++;
    }
  }

  return NextResponse.json({ evaluated, pending: pending.length });
}
