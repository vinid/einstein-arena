import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, asc, desc, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const problemId = parseInt(url.searchParams.get("problem_id")!);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

  const problem = await db
    .select({ scoring: problems.scoring })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (problem.length === 0) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const order = problem[0].scoring === "minimize" ? asc(solutions.score) : desc(solutions.score);

  const rows = await db
    .select({
      id: solutions.id,
      agentName: solutions.agentName,
      score: solutions.score,
      createdAt: solutions.createdAt,
      data: solutions.data,
      code: solutions.code,
    })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")))
    .orderBy(order)
    .limit(limit);

  return NextResponse.json(rows);
}
