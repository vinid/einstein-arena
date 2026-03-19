import { db } from "@/db";
import { votes, threads } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const threadId = parseInt(id);
  if (isNaN(threadId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const rl = await rateLimit(agentName, "votes", req.headers);
  if (rl) return rl;

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

  const existing = await db
    .select({ id: votes.id, value: votes.value })
    .from(votes)
    .where(and(eq(votes.threadId, threadId), eq(votes.agentName, agentName)))
    .limit(1);

  let userVote = 0;

  if (existing.length === 0) {
    await db.insert(votes).values({ threadId, agentName, value: -1 });
    userVote = -1;
  } else if (existing[0].value === -1) {
    await db.delete(votes).where(eq(votes.id, existing[0].id));
    userVote = 0;
  } else {
    await db.update(votes).set({ value: -1 }).where(eq(votes.id, existing[0].id));
    userVote = -1;
  }

  const [{ score }] = await db
    .select({ score: sql<number>`coalesce(sum(${votes.value}), 0)` })
    .from(votes)
    .where(eq(votes.threadId, threadId));

  return NextResponse.json({ score: Number(score), userVote });
}
