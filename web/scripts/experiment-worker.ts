import { and, eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { problems, solutions } from "../src/db/schema";
import { decideDisposition } from "../src/lib/evaluate";
import { evaluateLocally } from "../src/lib/local-evaluate";

const POLL_MS = 2_000;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
if (!process.env.EXPERIMENT_ARM) {
  throw new Error("EXPERIMENT_ARM is required");
}
if (!process.env.EXPERIMENT_PROBLEM_SLUG) {
  throw new Error("EXPERIMENT_PROBLEM_SLUG is required");
}

async function nextSubmission() {
  const claimed = await db.execute<{ id: number }>(sql`
    UPDATE solutions
    SET status = 'evaluating'
    WHERE id = (
      SELECT solutions.id
      FROM solutions
      INNER JOIN problems ON problems.id = solutions.problem_id
      WHERE solutions.status = 'pending'
        AND problems.slug = ${process.env.EXPERIMENT_PROBLEM_SLUG!}
      ORDER BY solutions.created_at
      LIMIT 1
      FOR UPDATE OF solutions SKIP LOCKED
    )
    RETURNING id
  `);
  const claimedId = claimed.rows[0]?.id;
  if (!claimedId) {
    return null;
  }

  const rows = await db
    .select({
      id: solutions.id,
      agentName: solutions.agentName,
      problemId: solutions.problemId,
      verifier: problems.verifier,
      scoring: problems.scoring,
      minImprovement: problems.minImprovement,
      data: solutions.data,
    })
    .from(solutions)
    .innerJoin(problems, eq(solutions.problemId, problems.id))
    .where(eq(solutions.id, claimedId))
    .limit(1);

  return rows[0] ?? null;
}

async function processNext() {
  const submission = await nextSubmission();
  if (!submission) {
    return false;
  }

  try {
    const score = await evaluateLocally(
      submission.verifier,
      submission.data as Record<string, unknown>,
    );
    const best = submission.scoring === "minimize" ? sql<number>`min(${solutions.score})` : sql<number>`max(${solutions.score})`;
    const [global] = await db
      .select({ score: best })
      .from(solutions)
      .where(and(eq(solutions.problemId, submission.problemId), eq(solutions.status, "evaluated")));
    const [own] = await db
      .select({ score: best })
      .from(solutions)
      .where(and(
        eq(solutions.problemId, submission.problemId),
        eq(solutions.agentName, submission.agentName),
        eq(solutions.status, "evaluated"),
      ));
    const disposition = decideDisposition(
      score,
      global.score,
      own.score === null ? null : { id: 0, score: own.score },
      submission,
    );
    const rejected = disposition === "rejected_min_improvement";
    await db
      .update(solutions)
      .set({
        status: rejected ? "rejected" : "evaluated",
        score,
        error: rejected
          ? `Rejected: score ${score} improves on your best (${own.score}) or the current #1 (${global.score}) by less than minImprovement ${submission.minImprovement}.`
          : null,
        evaluatedAt: new Date(),
      })
      .where(eq(solutions.id, submission.id));
    console.log(`[experiment-worker] submission=${submission.id} score=${score} ${disposition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(solutions)
      .set({
        status: "error",
        error: message,
        evaluatedAt: new Date(),
      })
      .where(eq(solutions.id, submission.id));
    console.warn(
      `[experiment-worker] submission=${submission.id} error=${message}`,
    );
  }

  return true;
}

async function main() {
  await db
    .update(solutions)
    .set({ status: "pending" })
    .where(eq(solutions.status, "evaluating"));

  console.log(
    `[experiment-worker] polling ${process.env.EXPERIMENT_PROBLEM_SLUG} every ${POLL_MS}ms`,
  );

  while (true) {
    const processed = await processNext();
    if (!processed) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
