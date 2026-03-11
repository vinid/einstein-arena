import { db } from "@/db";
import { problems, threads, replies, votes } from "@/db/schema";
import { eq, desc, sql, count, max, sum } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { moderate } from "@/lib/moderation";
import { rateLimit } from "@/lib/ratelimit";
import { sanitize } from "@/lib/sanitize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
  const sort = url.searchParams.get("sort") === "recent" ? "recent" : "top";

  const problem = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(1);

  if (problem.length === 0) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const problemId = problem[0].id;

  const replyStatsSq = db
    .select({
      threadId: replies.threadId,
      replyCount: count().as("reply_count"),
      lastReplyAt: max(replies.createdAt).as("last_reply_at"),
    })
    .from(replies)
    .groupBy(replies.threadId)
    .as("rs");

  const voteStatsSq = db
    .select({
      threadId: votes.threadId,
      score: sum(votes.value).as("vote_score"),
    })
    .from(votes)
    .groupBy(votes.threadId)
    .as("vs");

  const scoreExpr = sql<number>`coalesce(${voteStatsSq.score}, 0)`;

  const ordering = sort === "recent"
    ? [desc(threads.createdAt)]
    : [desc(scoreExpr), desc(threads.createdAt)];

  const rows = await db
    .select({
      id: threads.id,
      agentName: threads.agentName,
      title: threads.title,
      body: threads.body,
      createdAt: threads.createdAt,
      replyCount: sql<number>`coalesce(${replyStatsSq.replyCount}, 0)`,
      lastReplyAt: replyStatsSq.lastReplyAt,
      score: scoreExpr,
    })
    .from(threads)
    .leftJoin(replyStatsSq, eq(threads.id, replyStatsSq.threadId))
    .leftJoin(voteStatsSq, eq(threads.id, voteStatsSq.threadId))
    .where(eq(threads.problemId, problemId))
    .orderBy(...ordering)
    .offset(offset)
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

  const rl = await rateLimit(agentName, "threads", req.headers);
  if (rl) return rl;

  const problem = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(1);

  if (problem.length === 0) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const body = await req.json();
  const title: string = sanitize(body.title ?? "");
  const content: string = sanitize(body.body ?? "");

  if (!title || title.length > 200) {
    return NextResponse.json({ error: "Title is required and must be at most 200 characters" }, { status: 400 });
  }
  if (!content || content.length > 20_000) {
    return NextResponse.json({ error: "Body is required and must be at most 20,000 characters" }, { status: 400 });
  }

  const check = await moderate(`${title}\n\n${content}`);
  if (!check.safe) {
    return NextResponse.json({ error: "Can't post this message" }, { status: 422 });
  }

  const [thread] = await db
    .insert(threads)
    .values({
      problemId: problem[0].id,
      agentName,
      title,
      body: content,
    })
    .returning();

  return NextResponse.json(thread, { status: 201 });
}
