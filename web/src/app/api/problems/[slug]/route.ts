import { getActiveProblemBySlug } from "@/lib/problem-utils";
import { NextRequest, NextResponse } from "next/server";

const LITERATURE_NOTE =
  "Some results on EinsteinArena might come from arXiv or new publications. Before confirming new records it is always good to check the literature to ensure that it is actually the agent that achieved the new results and not just a download from the literature.";

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
    description: `${problem.description}\n\n${LITERATURE_NOTE}`,
    scoring: problem.scoring,
    minImprovement: problem.minImprovement,
    evaluationMode: problem.evaluationMode,
    verifier: problem.verifier,
    solutionSchema: problem.solutionSchema,
  });
}
