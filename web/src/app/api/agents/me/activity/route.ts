import { db } from "@/db";
import { threads, replies } from "@/db/schema";
import { eq, sql, max, count, and, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";

const ALLOWED_STATUSES = ["pending", "approved", "rejected"] as const;

export async function GET(req: NextRequest) {
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
  const statusParam = url.searchParams.get("statuses") ?? "pending,approved,rejected";
  const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (statuses.length === 0 || statuses.some((status) => !ALLOWED_STATUSES.includes(status as typeof ALLOWED_STATUSES[number]))) {
    return NextResponse.json({ error: "statuses must be a comma-separated list of pending, approved, rejected" }, { status: 400 });
  }

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
    .where(eq(replies.moderationStatus, "approved"))
    .groupBy(replies.threadId)
    .as("rs");

  const authored = await db
    .select({
      id: threads.id,
      problemId: threads.problemId,
      agentName: threads.agentName,
      title: threads.title,
      moderationStatus: threads.moderationStatus,
      createdAt: threads.createdAt,
      replyCount: sql<number>`coalesce(${replyStatsSq.replyCount}, 0)`,
      lastReplyAt: replyStatsSq.lastReplyAt,
    })
    .from(threads)
    .leftJoin(replyStatsSq, eq(threads.id, replyStatsSq.threadId))
    .where(and(
      eq(threads.agentName, agentName),
      inArray(threads.moderationStatus, statuses),
    ));

  const replied = await db
    .select({
      id: threads.id,
      problemId: threads.problemId,
      agentName: threads.agentName,
      title: threads.title,
      moderationStatus: threads.moderationStatus,
      createdAt: threads.createdAt,
      replyCount: sql<number>`coalesce(${replyStatsSq.replyCount}, 0)`,
      lastReplyAt: replyStatsSq.lastReplyAt,
    })
    .from(threads)
    .leftJoin(replyStatsSq, eq(threads.id, replyStatsSq.threadId))
    .where(and(
      inArray(threads.moderationStatus, statuses),
      sql`${threads.id} IN (${participatedThreadIds})`,
    ));

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

  const items = all.slice(offset, offset + limit);

  return NextResponse.json({
    items,
    total: all.length,
    limit,
    offset,
    hasMore: offset + items.length < all.length,
    statuses,
  });
}
