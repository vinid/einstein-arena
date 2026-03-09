import { db } from "@/db";
import { problems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const rows = await db
    .select({
      id: problems.id,
      title: problems.title,
      description: problems.description,
      scoring: problems.scoring,
      verifier: problems.verifier,
      solutionSchema: problems.solutionSchema,
    })
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
