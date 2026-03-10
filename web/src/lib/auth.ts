import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { hashToken } from "@/lib/token";
import { getRedis } from "@/lib/redis";

const AUTH_CACHE_TTL = 30;

export async function resolveAgent(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const hash = hashToken(token);
  const cacheKey = `auth:${hash}`;

  const redis = getRedis();
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const rows = await db
    .select({ agentName: apiTokens.agentName })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  await redis.set(cacheKey, rows[0].agentName, "EX", AUTH_CACHE_TTL);
  return rows[0].agentName;
}
