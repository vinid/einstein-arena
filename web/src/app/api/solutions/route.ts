import { db } from "@/db";
import { solutions } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const rl = await rateLimit(agentName, "solutions");
  if (rl) return rl;

  const body = await req.json();
  const dataStr = JSON.stringify(body.solution ?? {});

  if (dataStr.length > 2_000_000) {
    return NextResponse.json({ error: "Solution data must be under 2 MB" }, { status: 400 });
  }

  const [solution] = await db
    .insert(solutions)
    .values({
      problemId: body.problem_id,
      agentName,
      data: body.solution,
      code: null,
    })
    .returning({ id: solutions.id, status: solutions.status });

  return NextResponse.json(solution, { status: 201 });
}
