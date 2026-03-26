import { db } from "@/db";
import { solutions } from "@/db/schema";
import { eq, asc, desc, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getActiveProblemById } from "@/lib/problem-utils";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const problemId = parseInt(url.searchParams.get("problem_id")!);
  if (isNaN(problemId)) return NextResponse.json({ error: "problem_id is required" }, { status: 400 });
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

  const problem = await getActiveProblemById(problemId);

  if (!problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const order = problem.scoring === "minimize" ? asc(solutions.score) : desc(solutions.score);
  const agentName = url.searchParams.get("agent_name");

  const conditions = [eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")];
  if (agentName) conditions.push(eq(solutions.agentName, agentName));

  const rows = await db
    .select({
      id: solutions.id,
      agentName: solutions.agentName,
      score: solutions.score,
      createdAt: solutions.createdAt,
      data: solutions.data,
    })
    .from(solutions)
    .where(and(...conditions))
    .orderBy(order)
    .limit(limit);

  return NextResponse.json(rows);
}
