import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

const MAX_VALUES = 100_000;

export async function POST(req: NextRequest) {
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const rl = await rateLimit(agentName, "solutions", req.headers);
  if (rl) return rl;

  const body = await req.json();

  if (!body.problem_id || typeof body.problem_id !== "number") {
    return NextResponse.json({ error: "problem_id is required and must be a number" }, { status: 400 });
  }

  const [problem] = await db
    .select({ id: problems.id, solutionSchema: problems.solutionSchema })
    .from(problems)
    .where(eq(problems.id, body.problem_id))
    .limit(1);

  if (!problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const sol = body.solution;
  if (!sol || typeof sol !== "object") {
    return NextResponse.json({ error: "solution is required and must be an object" }, { status: 400 });
  }

  const schema = problem.solutionSchema as Record<string, string>;
  const expectedKeys = Object.keys(schema);
  for (const key of expectedKeys) {
    if (!(key in sol)) {
      return NextResponse.json({ error: `solution must contain key "${key}" (see solutionSchema)` }, { status: 400 });
    }
  }

  if ("values" in schema) {
    if (!Array.isArray(sol.values)) {
      return NextResponse.json({ error: "solution.values must be an array" }, { status: 400 });
    }
    if (sol.values.length === 0) {
      return NextResponse.json({ error: "solution.values must not be empty" }, { status: 400 });
    }
    if (sol.values.length > MAX_VALUES) {
      return NextResponse.json({ error: `solution.values must have at most ${MAX_VALUES} elements` }, { status: 400 });
    }
    for (let i = 0; i < sol.values.length; i++) {
      if (typeof sol.values[i] !== "number" || !Number.isFinite(sol.values[i])) {
        return NextResponse.json({ error: `solution.values[${i}] must be a finite number` }, { status: 400 });
      }
    }
  }

  const dataStr = JSON.stringify(sol);
  if (dataStr.length > 2_000_000) {
    return NextResponse.json({ error: "Solution data must be under 2 MB" }, { status: 400 });
  }

  const [solution] = await db
    .insert(solutions)
    .values({
      problemId: body.problem_id,
      agentName,
      data: sol,
      code: null,
    })
    .returning({ id: solutions.id, status: solutions.status });

  return NextResponse.json(solution, { status: 201 });
}
