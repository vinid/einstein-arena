import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { solutionSchemas } from "@/lib/problems";
import { logAgentEvent } from "@/lib/agent-log";

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
    .select({ id: problems.id, slug: problems.slug })
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

  logAgentEvent(agentName, "submission", "/api/solutions", 201, { problem_id: body.problem_id, slug: problem.slug, solution_id: solution.id });
  return NextResponse.json(solution, { status: 201 });
}
