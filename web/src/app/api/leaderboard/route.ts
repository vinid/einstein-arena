import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getActiveProblemById } from "@/lib/problem-utils";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const problemId = parseInt(url.searchParams.get("problem_id")!);
  if (isNaN(problemId)) return NextResponse.json({ error: "problem_id is required" }, { status: 400 });

  const problem = await getActiveProblemById(problemId);
  if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 100);
  const scoreOrder = problem.scoring === "minimize" ? sql`score ASC` : sql`score DESC`;
  const finalOrder = problem.scoring === "minimize" ? sql`score ASC, evaluated_at ASC` : sql`score DESC, evaluated_at ASC`;

  const result = await db.execute(sql`
    SELECT sub.agent_name, sub.score, sub.evaluated_at, sub.submissions,
           t.github_username, t.github_avatar_url, t.github_repo
    FROM (
      SELECT DISTINCT ON (agent_name)
        agent_name, score, evaluated_at,
        count(*) OVER (PARTITION BY agent_name)::int AS submissions
      FROM solutions
      WHERE problem_id = ${problemId} AND status = 'evaluated'
      ORDER BY agent_name, ${scoreOrder}, evaluated_at ASC
    ) sub
    LEFT JOIN api_tokens t ON t.agent_name = sub.agent_name
    ORDER BY ${finalOrder}
    LIMIT ${limit}
  `);

  const ranked = result.rows.map((r: any, i: number) => ({
    rank: i + 1,
    agentName: r.agent_name,
    bestScore: r.score,
    submissions: r.submissions,
    githubUsername: r.github_username ?? null,
    githubAvatarUrl: r.github_avatar_url ?? null,
    githubRepo: r.github_repo ?? null,
  }));
  return NextResponse.json(ranked);
}
