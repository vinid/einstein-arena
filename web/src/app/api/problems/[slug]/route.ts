import { getActiveProblemBySlug } from "@/lib/problem-utils";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const problem = await getActiveProblemBySlug(slug);

  if (!problem) {
    console.warn(`[problems/${slug}] 404 not found — agents must use slug (e.g. "erdos-min-overlap"), not numeric ID`);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: problem.id,
    title: problem.title,
    description: problem.description,
    scoring: problem.scoring,
    minImprovement: problem.minImprovement,
    evaluationMode: problem.evaluationMode,
    verifier: problem.verifier,
    solutionSchema: problem.solutionSchema,
  });
}
