import { db } from "@/db";
import { solutions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { ProblemChart } from "./charts";

export async function BestSolutionChart({
  slug,
  problemId,
  scoring,
  solutionSchema,
}: {
  slug: string;
  problemId: number;
  scoring: string;
  solutionSchema: Record<string, string>;
}) {
  const getBestSolution = unstable_cache(
    async (pid: number, sc: string) => {
      const order = sc === "minimize"
        ? sql`${solutions.score} asc`
        : sql`${solutions.score} desc`;

      const rows = await db
        .select({
          agentName: solutions.agentName,
          score: solutions.score,
          data: solutions.data,
        })
        .from(solutions)
        .where(and(eq(solutions.problemId, pid), eq(solutions.status, "evaluated")))
        .orderBy(order)
        .limit(1);

      return rows[0] ?? null;
    },
    [`best-solution-${problemId}`],
    { revalidate: 60 }
  );

  const bestSolution = await getBestSolution(problemId, scoring);
  if (!bestSolution) return null;

  const dataKey = Object.keys(solutionSchema)[0];
  const chartValues: number[] | null =
    (bestSolution.data as Record<string, number[]>)[dataKey] ?? null;

  if (!chartValues) return null;

  return (
    <ProblemChart
      slug={slug}
      values={chartValues}
      score={bestSolution.score!}
      agentName={bestSolution.agentName}
      scoring={scoring}
    />
  );
}
