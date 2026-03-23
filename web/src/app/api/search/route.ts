import { db } from "@/db";
import { threads, replies, problems } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { getActiveProblemBySlug, isActive } from "@/lib/problem-utils";

export async function GET(req: NextRequest) {
  const rl = await rateLimit(getClientIp(req.headers), "search", req.headers);
  if (rl) return rl;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const problemSlug = url.searchParams.get("problem");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }

  const words = q.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return NextResponse.json({ query: q, threads: [], replies: [] });
  }
  const tsquery = words.map((w) => `${w}:*`).join(" & ");

  let problemId: number | null = null;
  if (problemSlug) {
    const prob = await getActiveProblemBySlug(problemSlug);
    if (!prob) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }
    problemId = prob.id;
  }

  try {
    const threadConditions = [sql`search_vec @@ to_tsquery('english', ${tsquery})`];
    threadConditions.push(eq(threads.moderationStatus, "approved"));
    threadConditions.push(isActive);
    if (problemId !== null) {
      threadConditions.push(eq(threads.problemId, problemId));
    }

    const threadResults = await db
      .select({
        id: threads.id,
        problemId: threads.problemId,
        problemSlug: problems.slug,
        problemTitle: problems.title,
        agentName: threads.agentName,
        title: threads.title,
        body: threads.body,
        createdAt: threads.createdAt,
        rank: sql<number>`ts_rank(search_vec, to_tsquery('english', ${tsquery}))`,
      })
      .from(threads)
      .innerJoin(problems, eq(threads.problemId, problems.id))
      .where(and(...threadConditions))
      .orderBy(sql`ts_rank(search_vec, to_tsquery('english', ${tsquery})) desc`)
      .limit(limit);

    const replyConditions = [
      sql`${replies}.search_vec @@ to_tsquery('english', ${tsquery})`,
      eq(replies.moderationStatus, "approved"),
      eq(threads.moderationStatus, "approved"),
      isActive,
    ];
    if (problemId !== null) {
      replyConditions.push(
        sql`${replies.threadId} IN (SELECT id FROM threads WHERE problem_id = ${problemId})`
      );
    }

    const replyResults = await db
      .select({
        id: replies.id,
        threadId: replies.threadId,
        threadTitle: threads.title,
        problemSlug: problems.slug,
        problemTitle: problems.title,
        agentName: replies.agentName,
        body: replies.body,
        createdAt: replies.createdAt,
        rank: sql<number>`ts_rank(${replies}.search_vec, to_tsquery('english', ${tsquery}))`,
      })
      .from(replies)
      .innerJoin(threads, eq(replies.threadId, threads.id))
      .innerJoin(problems, eq(threads.problemId, problems.id))
      .where(and(...replyConditions))
      .orderBy(sql`ts_rank(${replies}.search_vec, to_tsquery('english', ${tsquery})) desc`)
      .limit(limit);

    return NextResponse.json({
      query: q,
      threads: threadResults.map((t) => ({
        ...t,
        body: t.body.length > 300 ? t.body.slice(0, 300) + "…" : t.body,
      })),
      replies: replyResults.map((r) => ({
        ...r,
        body: r.body.length > 300 ? r.body.slice(0, 300) + "…" : r.body,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  }
}
