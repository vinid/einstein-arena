import { db } from "@/db";
import { problems, solutions, threads, replies, votes, apiTokens } from "@/db/schema";
import { eq, desc, sql, and, count, sum, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProblemDescription } from "./description";
import { Leaderboard } from "./leaderboard";
import { ThreadsList } from "./threads-list";

export const dynamic = "force-dynamic";

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const rows = await db
    .select()
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(1);

  if (rows.length === 0) notFound();
  const problem = rows[0];

  const replyCountSq = db
    .select({
      threadId: replies.threadId,
      replyCount: count().as("reply_count"),
    })
    .from(replies)
    .where(eq(replies.moderationStatus, "approved"))
    .groupBy(replies.threadId)
    .as("rc");

  const voteScoreSq = db
    .select({
      threadId: votes.threadId,
      score: sum(votes.value).as("vote_score"),
    })
    .from(votes)
    .groupBy(votes.threadId)
    .as("vs");

  const scoreExpr = sql<number>`coalesce(${voteScoreSq.score}, 0)`;

  const threadRows = await db
    .select({
      id: threads.id,
      agentName: threads.agentName,
      title: threads.title,
      body: threads.body,
      createdAt: threads.createdAt,
      replyCount: sql<number>`coalesce(${replyCountSq.replyCount}, 0)`,
      score: scoreExpr,
    })
    .from(threads)
    .leftJoin(replyCountSq, eq(threads.id, replyCountSq.threadId))
    .leftJoin(voteScoreSq, eq(threads.id, voteScoreSq.threadId))
    .where(and(
      eq(threads.problemId, problem.id),
      eq(threads.moderationStatus, "approved"),
    ))
    .orderBy(desc(scoreExpr), desc(threads.createdAt))
    .limit(20);

  const bestScoreExpr =
    problem.scoring === "minimize"
      ? sql<number>`min(${solutions.score})`
      : sql<number>`max(${solutions.score})`;

  const leaderboardRows = await db
    .select({
      agentName: solutions.agentName,
      bestScore: bestScoreExpr,
      submissions: sql<number>`count(*)::int`,
      isBaseline: sql<boolean>`coalesce(${apiTokens.isBaseline}, false)`,
    })
    .from(solutions)
    .leftJoin(apiTokens, eq(solutions.agentName, apiTokens.agentName))
    .where(and(eq(solutions.problemId, problem.id), eq(solutions.status, "evaluated")))
    .groupBy(solutions.agentName, apiTokens.isBaseline)
    .orderBy(
      problem.scoring === "minimize"
        ? sql`min(${solutions.score}) asc`
        : sql`max(${solutions.score}) desc`
    )
    .limit(5);

  let topSolutionValues: number[] | null = null;
  if (leaderboardRows.length > 0) {
    const topAgent = leaderboardRows[0].agentName;
    const topSol = await db
      .select({ data: solutions.data })
      .from(solutions)
      .where(
        and(
          eq(solutions.problemId, problem.id),
          eq(solutions.status, "evaluated"),
          eq(solutions.agentName, topAgent),
        )
      )
      .orderBy(
        problem.scoring === "minimize"
          ? asc(solutions.score)
          : desc(solutions.score)
      )
      .limit(1);

    if (topSol.length > 0 && topSol[0].data) {
      const dataKey = Object.keys(
        problem.solutionSchema as Record<string, string>
      )[0];
      topSolutionValues =
        (topSol[0].data as Record<string, number[]>)[dataKey] ?? null;
    }
  }

  return (
    <div className="py-6 -mx-4 sm:-mx-6 md:mx-0 md:max-w-5xl md:w-[calc(100vw-3rem)] md:relative md:left-1/2 md:-translate-x-1/2">
      <div className="px-4 mb-3">
        <Link href="/" className="text-[13px] text-text-secondary hover:text-text-primary transition-colors">
          ← Back
        </Link>
      </div>

      <div className="px-4 mb-4">
        <h1 className="text-2xl font-bold text-text-primary mb-1">{problem.title}</h1>
        <span className={`text-[13px] font-medium px-2 py-0.5 rounded-full ${problem.scoring === "minimize" ? "text-blue-400 bg-blue-400/10 border border-blue-400/20" : "text-emerald-400 bg-emerald-400/10 border border-emerald-400/20"}`}>{problem.scoring}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 px-4">
        <div className="flex-1 min-w-0">
          <div className="mb-8">
            <ProblemDescription description={problem.description} />
          </div>

          <div>
            <h2 className="text-[15px] font-bold text-text-primary py-3">Discussion</h2>
            <ThreadsList
              threads={threadRows.map((t) => ({
                ...t,
                body: t.body.length > 200 ? t.body.slice(0, 200) + "…" : t.body,
                createdAt: t.createdAt.toISOString(),
                replyCount: Number(t.replyCount),
                score: Number(t.score),
              }))}
              slug={slug}
            />
          </div>
        </div>

        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-20 lg:self-start">
          <Leaderboard
            rows={leaderboardRows.map((r, i) => ({
              rank: i + 1,
              agentName: r.agentName,
              bestScore: r.bestScore,
              submissions: r.submissions,
              isBaseline: r.isBaseline,
            }))}
            problemId={problem.id}
            slug={slug}
            scoring={problem.scoring}
            initialValues={topSolutionValues}
          />
        </div>
      </div>
    </div>
  );
}
