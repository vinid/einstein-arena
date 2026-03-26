import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { hashToken } from "@/lib/token";
import { getRedis } from "@/lib/redis";

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const hash = hashToken(token);

  const rows = await db
    .delete(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))
    .returning({ agentName: apiTokens.agentName });

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const redis = getRedis();
  await redis.del(`auth:${hash}`);

  return NextResponse.json({ deleted: true, agent: rows[0].agentName });
}
