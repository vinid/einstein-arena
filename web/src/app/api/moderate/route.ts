import { db } from "@/db";
import { replies, threads } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { moderate } from "@/lib/moderation";
import { getRedis } from "@/lib/redis";

const MAX_PER_BATCH = 20;
const MODERATION_LOCK_KEY = "locks:moderation";
const MODERATION_LOCK_TTL_SECONDS = 4 * 60;

async function releaseLock(lockValue: string) {
  await getRedis().eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    MODERATION_LOCK_KEY,
    lockValue
  );
}

async function processPendingThreads() {
  const pending = await db
    .select({
      id: threads.id,
      title: threads.title,
      body: threads.body,
      createdAt: threads.createdAt,
    })
    .from(threads)
    .where(eq(threads.moderationStatus, "pending"))
    .orderBy(asc(threads.createdAt))
    .limit(MAX_PER_BATCH);

  let approved = 0;
  let rejected = 0;
  let errors = 0;

  for (const thread of pending) {
    try {
      const result = await moderate(`${thread.title}\n\n${thread.body}`);
      await db
        .update(threads)
        .set({ moderationStatus: result.safe ? "approved" : "rejected" })
        .where(eq(threads.id, thread.id));
      if (result.safe) {
        approved++;
      } else {
        rejected++;
      }
    } catch (error) {
      errors++;
      console.error(`[moderate] thread=${thread.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { processed: pending.length, approved, rejected, errors };
}

async function processPendingReplies() {
  const pending = await db
    .select({
      id: replies.id,
      body: replies.body,
      createdAt: replies.createdAt,
    })
    .from(replies)
    .where(eq(replies.moderationStatus, "pending"))
    .orderBy(asc(replies.createdAt))
    .limit(MAX_PER_BATCH);

  let approved = 0;
  let rejected = 0;
  let errors = 0;

  for (const reply of pending) {
    try {
      const result = await moderate(reply.body);
      await db
        .update(replies)
        .set({ moderationStatus: result.safe ? "approved" : "rejected" })
        .where(eq(replies.id, reply.id));
      if (result.safe) {
        approved++;
      } else {
        rejected++;
      }
    } catch (error) {
      errors++;
      console.error(`[moderate] reply=${reply.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { processed: pending.length, approved, rejected, errors };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  const lockValue = randomUUID();
  const locked = await redis.set(MODERATION_LOCK_KEY, lockValue, "EX", MODERATION_LOCK_TTL_SECONDS, "NX");

  if (locked !== "OK") {
    return NextResponse.json({ skipped: true, reason: "already_running" });
  }

  try {
    const threadsResult = await processPendingThreads();
    const repliesResult = await processPendingReplies();

    return NextResponse.json({
      threads: threadsResult,
      replies: repliesResult,
      processed: threadsResult.processed + repliesResult.processed,
      skipped: false,
    });
  } finally {
    await releaseLock(lockValue);
  }
}
