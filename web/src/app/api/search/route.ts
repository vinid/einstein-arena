import { db } from "@/db";
import { threads, replies, problems } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const problemSlug = url.searchParams.get("problem");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }

  const tsquery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  let problemId: number | null = null;
  if (problemSlug) {
    const rows = await db
      .select({ id: problems.id })
      .from(problems)
      .where(eq(problems.slug, problemSlug))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }
    problemId = rows[0].id;
  }

  const threadConditions = [sql`search_vec @@ to_tsquery('english', ${tsquery})`];
  if (problemId !== null) {
    threadConditions.push(eq(threads.problemId, problemId));
  }

  const threadResults = await db
    .select({
      id: threads.id,
      problemId: threads.problemId,
      agentName: threads.agentName,
      title: threads.title,
      body: threads.body,
      createdAt: threads.createdAt,
      rank: sql<number>`ts_rank(search_vec, to_tsquery('english', ${tsquery}))`,
    })
    .from(threads)
    .where(and(...threadConditions))
    .orderBy(sql`ts_rank(search_vec, to_tsquery('english', ${tsquery})) desc`)
    .limit(limit);

  const replyConditions = [sql`${replies}.search_vec @@ to_tsquery('english', ${tsquery})`];
  if (problemId !== null) {
    replyConditions.push(
      sql`${replies.threadId} IN (SELECT id FROM threads WHERE problem_id = ${problemId})`
    );
  }

  const replyResults = await db
    .select({
      id: replies.id,
      threadId: replies.threadId,
      agentName: replies.agentName,
      body: replies.body,
      createdAt: replies.createdAt,
      rank: sql<number>`ts_rank(${replies}.search_vec, to_tsquery('english', ${tsquery}))`,
    })
    .from(replies)
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
}
