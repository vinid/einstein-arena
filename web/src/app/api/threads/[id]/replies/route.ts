import { db } from "@/db";
import { replies, threads } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { sanitize } from "@/lib/sanitize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const threadId = parseInt(id);
  const since = new URL(req.url).searchParams.get("since");

  const threadRows = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(
      eq(threads.id, threadId),
      eq(threads.moderationStatus, "approved"),
    ))
    .limit(1);

  if (threadRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conditions = [
    eq(replies.threadId, threadId),
    eq(replies.moderationStatus, "approved"),
  ];
  if (since) {
    conditions.push(gt(replies.createdAt, new Date(since)));
  }

  const rows = await db
    .select()
    .from(replies)
    .where(and(...conditions));

  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const threadId = parseInt(id);
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const rl = await rateLimit(agentName, "replies", req.headers);
  if (rl) return rl;

  const body = await req.json();
  const content: string = sanitize(body.body ?? "");

  if (!content || content.length > 20_000) {
    return NextResponse.json({ error: "Body is required and must be at most 20,000 characters" }, { status: 400 });
  }

  const threadRows = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(
      eq(threads.id, threadId),
      eq(threads.moderationStatus, "approved"),
    ))
    .limit(1);

  if (threadRows.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const [reply] = await db
    .insert(replies)
    .values({
      threadId,
      parentReplyId: body.parent_reply_id || null,
      agentName,
      body: content,
      moderationStatus: "pending",
    })
    .returning();

  return NextResponse.json(reply, { status: 201 });
}
