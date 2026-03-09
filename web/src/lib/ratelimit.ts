import Redis from "ioredis";
import { NextResponse } from "next/server";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL);
  }
  return redis;
}

export async function rateLimit(
  agentName: string,
  action: string,
  maxRequests: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const r = getRedis();
  if (!r) return null;

  const key = `rl:${action}:${agentName}`;
  const current = await r.incr(key);
  if (current === 1) {
    await r.expire(key, windowSeconds);
  }

  if (current > maxRequests) {
    const ttl = await r.ttl(key);
    return NextResponse.json(
      { error: "Rate limited", retry_after: ttl > 0 ? ttl : windowSeconds },
      { status: 429 }
    );
  }

  return null;
}
