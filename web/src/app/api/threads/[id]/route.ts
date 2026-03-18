import { db } from "@/db";
import { threads, votes } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const threadId = parseInt(id);

  const rows = await db
    .select()
    .from(threads)
    .where(and(
      eq(threads.id, threadId),
      eq(threads.moderationStatus, "approved"),
    ))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ score }] = await db
    .select({ score: sql<number>`coalesce(sum(${votes.value}), 0)` })
    .from(votes)
    .where(eq(votes.threadId, threadId));

  return NextResponse.json({ ...rows[0], score: Number(score) });
}
