import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { solutionSchemas, DEFAULT_MIN_IMPROVEMENT } from "@/lib/problems";
import { decideDisposition } from "@/lib/evaluate";

async function getGlobalBest(problemId: number, scoring: string): Promise<number | null> {
  const agg = scoring === "minimize"
    ? sql<number>`min(${solutions.score})`
    : sql<number>`max(${solutions.score})`;
  const rows = await db
    .select({ best: agg })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")));
  return rows[0]?.best ?? null;
}

async function getAgentBest(
  problemId: number,
  agentName: string,
  scoring: string
): Promise<{ id: number; score: number } | null> {
  const order = scoring === "minimize"
    ? sql`${solutions.score} asc`
    : sql`${solutions.score} desc`;
  const rows = await db
    .select({ id: solutions.id, score: solutions.score })
    .from(solutions)
    .where(and(
      eq(solutions.problemId, problemId),
      eq(solutions.agentName, agentName),
      eq(solutions.status, "evaluated"),
    ))
    .orderBy(order)
    .limit(1);
  if (!rows.length || rows[0].score === null) return null;
  return { id: rows[0].id, score: rows[0].score! };
}

export async function POST(req: NextRequest) {
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const rl = await rateLimit(agentName, "solutions", req.headers);
  if (rl) {
    console.warn(`[solutions] 429 agent=${agentName} rate limited`);
    return rl;
  }

  const body = await req.json();

  if (!body.problem_id || typeof body.problem_id !== "number") {
    return NextResponse.json({ error: "problem_id is required and must be a number" }, { status: 400 });
  }

  const [problem] = await db
    .select({
      id: problems.id,
      slug: problems.slug,
      scoring: problems.scoring,
      minImprovement: problems.minImprovement,
    })
    .from(problems)
    .where(eq(problems.id, body.problem_id))
    .limit(1);

  if (!problem) {
    console.warn(`[solutions] 404 agent=${agentName} problem_id=${body.problem_id} not found`);
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const sol = body.solution;
  if (!sol || typeof sol !== "object") {
    return NextResponse.json({ error: "solution is required and must be an object" }, { status: 400 });
  }

  const schema = solutionSchemas[problem.slug];
  if (schema) {
    const result = schema.safeParse(sol);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue.path.length ? issue.path.join(".") : "";
      const msg = path ? `solution.${path}: ${issue.message}` : issue.message;
      console.warn(`[solutions] 400 agent=${agentName} problem=${problem.slug} schema error: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const dataStr = JSON.stringify(sol);
  if (dataStr.length > 2_000_000) {
    return NextResponse.json({ error: "Solution data must be under 2 MB" }, { status: 400 });
  }

  const minImprovement = problem.minImprovement ?? DEFAULT_MIN_IMPROVEMENT;
  const globalBest = await getGlobalBest(problem.id, problem.scoring);
  const agentBest = await getAgentBest(problem.id, agentName, problem.scoring);

  const context = {
    current_best: globalBest,
    your_best: agentBest?.score ?? null,
    scoring: problem.scoring,
    min_improvement: minImprovement,
  };

  if (typeof body.expected_score === "number") {
    const disposition = decideDisposition(
      body.expected_score,
      globalBest,
      agentBest,
      { scoring: problem.scoring, minImprovement }
    );
    if (disposition === "rejected_min_improvement" || disposition === "discarded_personal") {
      console.warn(`[solutions] 409 agent=${agentName} problem=${problem.slug} expected_score=${body.expected_score} disposition=${disposition}`);
      return NextResponse.json({
        error: `expected_score ${body.expected_score} would be ${disposition}`,
        disposition,
        ...context,
      }, { status: 409 });
    }
  }

  const bypassToken = process.env.RATE_LIMIT_BYPASS_TOKEN;
  const isBypassed = bypassToken && req.headers.get("x-ratelimit-bypass") === bypassToken;
  const precomputedScore = isBypassed && typeof body.score === "number" ? body.score : null;

  const [solution] = await db
    .insert(solutions)
    .values({
      problemId: body.problem_id,
      agentName,
      data: sol,
      code: null,
      ...(precomputedScore !== null ? { status: "evaluated", score: precomputedScore, evaluatedAt: new Date() } : {}),
    })
    .returning({ id: solutions.id, status: solutions.status, score: solutions.score });

  return NextResponse.json({ ...solution, ...context }, { status: 201 });
}
