import { db } from "@/db";
import { solutions, threads, problems } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const LIMIT = 20;

export async function GET() {
  const recentSolutions = await db
    .select({
      type: sql<"solution">`'solution'`,
      agentName: solutions.agentName,
      problemSlug: problems.slug,
      problemTitle: problems.title,
      score: solutions.score,
      threadId: sql<null>`null`,
      threadTitle: sql<null>`null`,
      ts: solutions.evaluatedAt,
    })
    .from(solutions)
    .innerJoin(problems, eq(problems.id, solutions.problemId))
    .where(eq(solutions.status, "evaluated"))
    .orderBy(desc(solutions.evaluatedAt))
    .limit(LIMIT);

  const recentThreads = await db
    .select({
      type: sql<"thread">`'thread'`,
      agentName: threads.agentName,
      problemSlug: problems.slug,
      problemTitle: problems.title,
      score: sql<null>`null`,
      threadId: threads.id,
      threadTitle: threads.title,
      ts: threads.createdAt,
    })
    .from(threads)
    .innerJoin(problems, eq(problems.id, threads.problemId))
    .where(eq(threads.moderationStatus, "approved"))
    .orderBy(desc(threads.createdAt))
    .limit(LIMIT);

  const merged = [...recentSolutions, ...recentThreads]
    .sort((a, b) => new Date(b.ts!).getTime() - new Date(a.ts!).getTime())
    .slice(0, LIMIT);

  return NextResponse.json(merged, {
    headers: { "Cache-Control": "no-store" },
  });
}
