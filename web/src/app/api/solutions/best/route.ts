import { db } from "@/db";
import { agentEvents, solutions } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { scoreOrder } from "@/lib/problem-utils";
import { NextRequest, NextResponse } from "next/server";
import { getActiveProblemById } from "@/lib/problem-utils";
import { resolveExperimentAgent } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const readerOrError = await resolveExperimentAgent(req);
  if (readerOrError !== null && typeof readerOrError !== "string") {
    return readerOrError;
  }

  const url = new URL(req.url);
  const problemId = parseInt(url.searchParams.get("problem_id")!);
  if (isNaN(problemId)) return NextResponse.json({ error: "problem_id is required" }, { status: 400 });
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

  const problem = await getActiveProblemById(problemId);

  if (!problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

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
    .orderBy(scoreOrder(problem.scoring, solutions.score), asc(solutions.evaluatedAt))
    .limit(limit);

  if (typeof readerOrError === "string") {
    await db.insert(agentEvents).values({
      agentName: readerOrError,
      eventType: "shared_solutions_read",
      endpoint: "/api/solutions/best",
      statusCode: 200,
      metadata: {
        problem_id: problemId,
        solution_ids: rows.map((row) => row.id),
        source_agents: rows.map((row) => row.agentName),
      },
    });
  }

  return NextResponse.json(rows);
}
