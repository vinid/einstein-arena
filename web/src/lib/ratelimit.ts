import { getRedis } from "./redis";
import { NextResponse } from "next/server";

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export const LIMITS = {
  register: { maxRequests: 20, windowSeconds: 3600 } as RateLimitConfig,
  solutions: { maxRequests: 10, windowSeconds: 1800 } as RateLimitConfig,
  threads: { maxRequests: 5, windowSeconds: 3600 } as RateLimitConfig,
  votes: { maxRequests: 60, windowSeconds: 3600 } as RateLimitConfig,
  replies: { maxRequests: 40, windowSeconds: 3600 } as RateLimitConfig,
  search: { maxRequests: 120, windowSeconds: 3600 } as RateLimitConfig,
};

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

async function check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcard(key);
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
  pipeline.expire(key, config.windowSeconds);

  const results = await pipeline.exec();
  const count = (results![1][1] as number) ?? 0;

  if (count >= config.maxRequests) {
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    const retryAfter = oldest.length >= 2
      ? Math.ceil((parseInt(oldest[1]) + config.windowSeconds * 1000 - now) / 1000)
      : config.windowSeconds;

    return { allowed: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true, remaining: config.maxRequests - count - 1 };
}

export async function rateLimit(
  identifier: string,
  endpoint: keyof typeof LIMITS,
  headers?: Headers
): Promise<NextResponse | null> {
  const bypassToken = process.env.RATE_LIMIT_BYPASS_TOKEN;
  if (bypassToken && headers?.get("x-ratelimit-bypass") === bypassToken) {
    return null;
  }

  const config = LIMITS[endpoint];
  const key = `rl:${endpoint}:${identifier}`;
  const result = await check(key, config);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retry_after_seconds: result.retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Limit": String(config.maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return null;
}

export function getClientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headers.get("x-real-ip")
    ?? "unknown";
}
