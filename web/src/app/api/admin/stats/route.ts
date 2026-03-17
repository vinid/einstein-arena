import { db } from "@/db";
import { solutions, problems, threads, replies, apiTokens } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [agents] = await db.select({ count: sql<number>`count(*)::int` }).from(apiTokens);
  const [threadCount] = await db.select({ count: sql<number>`count(*)::int` }).from(threads);
  const [replyCount] = await db.select({ count: sql<number>`count(*)::int` }).from(replies);

  const solutionsByStatus = await db
    .select({ status: solutions.status, count: sql<number>`count(*)::int` })
    .from(solutions)
    .groupBy(solutions.status);

  const perProblem = await db
    .select({
      slug: problems.slug,
      title: problems.title,
      scoring: problems.scoring,
      total: sql<number>`count(${solutions.id})::int`,
      evaluated: sql<number>`count(*) filter (where ${solutions.status} = 'evaluated')::int`,
      pending: sql<number>`count(*) filter (where ${solutions.status} = 'pending')::int`,
      errors: sql<number>`count(*) filter (where ${solutions.status} = 'error')::int`,
      bestScore: sql<number>`case when ${problems.scoring} = 'minimize' then min(${solutions.score}) else max(${solutions.score}) end`,
      uniqueAgents: sql<number>`count(distinct ${solutions.agentName})::int`,
    })
    .from(problems)
    .leftJoin(solutions, and(eq(solutions.problemId, problems.id), eq(solutions.status, "evaluated")))
    .groupBy(problems.id, problems.slug, problems.title, problems.scoring);

  const recentSolutions = await db
    .select({
      id: solutions.id,
      agentName: solutions.agentName,
      problemId: solutions.problemId,
      status: solutions.status,
      score: solutions.score,
      error: solutions.error,
      createdAt: solutions.createdAt,
      evaluatedAt: solutions.evaluatedAt,
    })
    .from(solutions)
    .orderBy(sql`${solutions.createdAt} desc`)
    .limit(30);

  const recentAgents = await db
    .select({
      agentName: apiTokens.agentName,
      isBaseline: apiTokens.isBaseline,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .orderBy(sql`${apiTokens.createdAt} desc`)
    .limit(20);

  const redis = getRedis();
  const now = new Date();
  const moderationHours: { hour: string; total: number; safe: number; blocked: number; errors: number; avgLatency: number }[] = [];
  const evalHours: { hour: string; sessions: number; executions: number; avgSessionMs: number; avgExecMs: number; totalBytes: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const d = new Date(now.getTime() - i * 3600_000);
    const hour = d.toISOString().slice(0, 13);

    const modData = await redis.hgetall(`metrics:moderation:${hour}`);
    if (modData && modData.total) {
      const total = parseInt(modData.total);
      moderationHours.push({
        hour,
        total,
        safe: parseInt(modData.safe || "0"),
        blocked: parseInt(modData.blocked || "0"),
        errors: parseInt(modData.errors || "0"),
        avgLatency: total > 0 ? Math.round(parseInt(modData.latency_sum || "0") / total) : 0,
      });
    }

    const evalData = await redis.hgetall(`metrics:eval:${hour}`);
    if (evalData && (evalData.sessions || evalData.executions)) {
      const sessions = parseInt(evalData.sessions || "0");
      const executions = parseInt(evalData.executions || "0");
      evalHours.push({
        hour,
        sessions,
        executions,
        avgSessionMs: sessions > 0 ? Math.round(parseInt(evalData.session_latency_sum || "0") / sessions) : 0,
        avgExecMs: executions > 0 ? Math.round(parseInt(evalData.exec_latency_sum || "0") / executions) : 0,
        totalBytes: parseInt(evalData.exec_bytes || "0"),
      });
    }
  }

  return NextResponse.json({
    agents: agents.count,
    threads: threadCount.count,
    replies: replyCount.count,
    solutionsByStatus: Object.fromEntries(solutionsByStatus.map((r) => [r.status, r.count])),
    perProblem,
    recentSolutions,
    recentAgents,
    moderation: moderationHours,
    evaluation: evalHours,
  });
}
