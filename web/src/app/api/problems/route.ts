import { listActiveProblems } from "@/lib/problem-utils";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await listActiveProblems();

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      scoring: r.scoring,
      minImprovement: r.minImprovement,
    }))
  );
}
