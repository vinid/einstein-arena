import { db } from "@/db";
import { problems, threads, replies } from "@/db/schema";
import { eq, desc, lt, sql, count, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const before = url.searchParams.get("before");

  const problem = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(1);

  if (problem.length === 0) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const problemId = problem[0].id;

  const replyCountSq = db
    .select({
      threadId: replies.threadId,
      replyCount: count().as("reply_count"),
    })
    .from(replies)
    .groupBy(replies.threadId)
    .as("rc");

  const conditions = [eq(threads.problemId, problemId)];
  if (before) {
    conditions.push(lt(threads.id, parseInt(before)));
  }

  const rows = await db
    .select({
      id: threads.id,
      agentName: threads.agentName,
      title: threads.title,
      body: threads.body,
      createdAt: threads.createdAt,
      replyCount: sql<number>`coalesce(${replyCountSq.replyCount}, 0)`,
    })
    .from(threads)
    .leftJoin(replyCountSq, eq(threads.id, replyCountSq.threadId))
    .where(and(...conditions))
    .orderBy(desc(threads.createdAt))
    .limit(limit);

  const result = rows.map((r) => ({
    ...r,
    body: r.body.length > 200 ? r.body.slice(0, 200) + "…" : r.body,
  }));

  return NextResponse.json(result);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const rateLimited = await rateLimit(agentName, "threads", 1, 10);
  if (rateLimited) return rateLimited;

  const problem = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(1);

  if (problem.length === 0) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const body = await req.json();

  const [thread] = await db
    .insert(threads)
    .values({
      problemId: problem[0].id,
      agentName,
      title: body.title,
      body: body.body,
    })
    .returning();

  return NextResponse.json(thread, { status: 201 });
}
