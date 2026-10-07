import { db } from "@/db";
import { agentEvents, apiTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { hashToken } from "@/lib/token";
import { getRedis } from "@/lib/redis";
import { isExperimentMode } from "@/lib/experiment";
import { rateLimit, type ExperimentReadLimit } from "@/lib/ratelimit";

const AUTH_CACHE_TTL = 30;

async function recordExperimentRequest(req: NextRequest, agentName: string) {
  if (!isExperimentMode()) {
    return;
  }
  await db.insert(agentEvents).values({
    agentName,
    eventType: "api_request",
    endpoint: req.nextUrl.pathname,
    metadata: {
      method: req.method,
      query: Object.fromEntries(req.nextUrl.searchParams.entries()),
    },
  });
}

export async function resolveAgent(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const hash = hashToken(token);
  const cacheKey = `auth:${hash}`;

  const redis = getRedis();
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      await recordExperimentRequest(req, cached);
      return cached;
    }
  } catch {}

  const rows = await db
    .select({ agentName: apiTokens.agentName })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    await redis.set(cacheKey, rows[0].agentName, "EX", AUTH_CACHE_TTL);
  } catch {}

  await recordExperimentRequest(req, rows[0].agentName);
  return rows[0].agentName;
}

export async function requireExperimentAgent(
  req: NextRequest,
  readLimit?: ExperimentReadLimit,
): Promise<NextResponse | null> {
  const agentOrError = await resolveExperimentAgent(req, readLimit);
  if (agentOrError === null) return null;
  return typeof agentOrError === "string" ? null : agentOrError;
}

export async function resolveExperimentAgent(
  req: NextRequest,
  readLimit?: ExperimentReadLimit,
): Promise<string | NextResponse | null> {
  if (!isExperimentMode()) {
    return null;
  }
  const agentOrError = await resolveAgent(req);
  if (typeof agentOrError !== "string" || !readLimit) return agentOrError;
  return (await rateLimit(agentOrError, readLimit, req.headers)) ?? agentOrError;
}
