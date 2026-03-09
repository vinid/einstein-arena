import { db } from "@/db";
import { problems } from "@/db/schema";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db
    .select({
      id: problems.id,
      slug: problems.slug,
      title: problems.title,
      scoring: problems.scoring,
    })
    .from(problems);

  return NextResponse.json(rows);
}
