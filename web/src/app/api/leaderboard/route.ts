import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const problemId = parseInt(url.searchParams.get("problem_id")!);

  const problem = await db
    .select({ scoring: problems.scoring })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (problem.length === 0) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const bestScoreExpr =
    problem[0].scoring === "minimize"
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
      problem[0].scoring === "minimize"
        ? sql`min(${solutions.score}) asc`
        : sql`max(${solutions.score}) desc`
    );

  const ranked = rows.map((r, i) => ({ rank: i + 1, ...r }));
  return NextResponse.json(ranked);
}
