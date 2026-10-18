import { listActiveProblems } from "@/lib/problem-utils";
import { NextRequest, NextResponse } from "next/server";
import { requireExperimentAgent } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authError = await requireExperimentAgent(req);
  if (authError) return authError;

  const rows = await listActiveProblems();

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      scoring: r.scoring,
      minImprovement: r.minImprovement,
      evaluationMode: r.evaluationMode,
    }))
  );
}
