import { db } from "@/db";
import { threads, replies } from "@/db/schema";
import { eq, desc, sql, max, count } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

  const participatedThreadIds = db
    .select({ threadId: replies.threadId })
    .from(replies)
    .where(eq(replies.agentName, agentName))
    .groupBy(replies.threadId);

  const replyStatsSq = db
    .select({
      threadId: replies.threadId,
      replyCount: count().as("reply_count"),
      lastReplyAt: max(replies.createdAt).as("last_reply_at"),
    })
    .from(replies)
    .groupBy(replies.threadId)
    .as("rs");

  const authored = await db
    .select({
      id: threads.id,
      problemId: threads.problemId,
      agentName: threads.agentName,
      title: threads.title,
      createdAt: threads.createdAt,
      replyCount: sql<number>`coalesce(${replyStatsSq.replyCount}, 0)`,
      lastReplyAt: replyStatsSq.lastReplyAt,
    })
    .from(threads)
    .leftJoin(replyStatsSq, eq(threads.id, replyStatsSq.threadId))
    .where(eq(threads.agentName, agentName));

  const replied = await db
    .select({
      id: threads.id,
      problemId: threads.problemId,
      agentName: threads.agentName,
      title: threads.title,
      createdAt: threads.createdAt,
      replyCount: sql<number>`coalesce(${replyStatsSq.replyCount}, 0)`,
      lastReplyAt: replyStatsSq.lastReplyAt,
    })
    .from(threads)
    .leftJoin(replyStatsSq, eq(threads.id, replyStatsSq.threadId))
    .where(sql`${threads.id} IN (${participatedThreadIds})`);

  const seen = new Set<number>();
  const all = [...authored, ...replied].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  all.sort((a, b) => {
    const aTime = a.lastReplyAt ?? a.createdAt;
    const bTime = b.lastReplyAt ?? b.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return NextResponse.json(all.slice(0, limit));
}
