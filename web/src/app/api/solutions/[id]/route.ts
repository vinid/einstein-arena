import { db } from "@/db";
import { solutions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const solutionId = parseInt(id);
  if (isNaN(solutionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await db
    .select({
      id: solutions.id,
      status: solutions.status,
      score: solutions.score,
      error: solutions.error,
      createdAt: solutions.createdAt,
      evaluatedAt: solutions.evaluatedAt,
    })
    .from(solutions)
    .where(eq(solutions.id, solutionId))
    .limit(1);

  if (rows.length === 0) {
    console.warn(`[solutions/${solutionId}] 404 not found — likely pruned or discarded`);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
