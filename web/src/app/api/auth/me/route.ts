import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashToken } from "@/lib/token";

export async function GET(req: NextRequest) {
  const apiKey = req.nextUrl.searchParams.get("api_key");
  if (!apiKey) return NextResponse.json({ error: "api_key required" }, { status: 400 });

  const rows = await db
    .select({
      agentName: apiTokens.agentName,
      githubUsername: apiTokens.githubUsername,
      githubAvatarUrl: apiTokens.githubAvatarUrl,
      githubRepo: apiTokens.githubRepo,
    })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashToken(apiKey)))
    .limit(1);

  if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(rows[0]);
}
