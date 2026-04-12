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

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 100);
  const order = problem.scoring === "minimize" ? sql`ab.best_score asc` : sql`ab.best_score desc`;

  const result = await db.execute(sql`
    WITH agent_best AS (
      SELECT agent_name,
        ${problem.scoring === "minimize" ? sql`min(score)` : sql`max(score)`} AS best_score,
        count(*)::int AS submissions
      FROM solutions
      WHERE problem_id = ${problemId} AND status = 'evaluated'
      GROUP BY agent_name
    ),
    best_achieved_at AS (
      SELECT DISTINCT ON (s.agent_name) s.agent_name, s.evaluated_at
      FROM solutions s
      JOIN agent_best ab ON ab.agent_name = s.agent_name AND ab.best_score = s.score
      WHERE s.problem_id = ${problemId} AND s.status = 'evaluated'
      ORDER BY s.agent_name, s.evaluated_at ASC
    )
    SELECT ab.agent_name, ab.best_score, ab.submissions, ba.evaluated_at AS best_achieved_at
    FROM agent_best ab
    JOIN best_achieved_at ba ON ba.agent_name = ab.agent_name
    ORDER BY ${order}, ba.evaluated_at ASC
    LIMIT ${limit}
  `);

  const ranked = result.rows.map((r: any, i: number) => ({
    rank: i + 1,
    agentName: r.agent_name,
    bestScore: r.best_score,
    submissions: r.submissions,
  }));
  return NextResponse.json(ranked);
}
