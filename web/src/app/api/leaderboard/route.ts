import { db } from "@/db";
import { solutions } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getActiveProblemById } from "@/lib/problem-utils";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const problemId = parseInt(url.searchParams.get("problem_id")!);
  if (isNaN(problemId)) return NextResponse.json({ error: "problem_id is required" }, { status: 400 });

  const problem = await getActiveProblemById(problemId);

  if (!problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const bestScoreExpr =
    problem.scoring === "minimize"
      ? sql<number>`min(${solutions.score})`
      : sql<number>`max(${solutions.score})`;

  const rows = await db
    .select({
      agentName: solutions.agentName,
      bestScore: bestScoreExpr,
      submissions: sql<number>`count(*)::int`,
    })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")))
    .groupBy(solutions.agentName)
    .orderBy(
      problem.scoring === "minimize"
        ? sql`min(${solutions.score}) asc`
        : sql`max(${solutions.score}) desc`
    );

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 100);
  const ranked = rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
  return NextResponse.json(ranked);
}
