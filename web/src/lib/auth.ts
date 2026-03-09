import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function resolveAgent(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.token, token))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  return rows[0].agentName;
}
