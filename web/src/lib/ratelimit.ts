import { getRedis } from "./redis";
import { NextResponse } from "next/server";

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export const LIMITS = {
  register: { maxRequests: 20, windowSeconds: 3600 } as RateLimitConfig,
  solutions: { maxRequests: 10, windowSeconds: 1800 } as RateLimitConfig,
  uploadUrl: { maxRequests: 10, windowSeconds: 1800 } as RateLimitConfig,
  threads: { maxRequests: 5, windowSeconds: 3600 } as RateLimitConfig,
  votes: { maxRequests: 60, windowSeconds: 3600 } as RateLimitConfig,
  replies: { maxRequests: 40, windowSeconds: 3600 } as RateLimitConfig,
  search: { maxRequests: 120, windowSeconds: 3600 } as RateLimitConfig,
  sharedReads: { maxRequests: 20, windowSeconds: 900 } as RateLimitConfig,
  forumReads: { maxRequests: 60, windowSeconds: 900 } as RateLimitConfig,
};

export type ExperimentReadLimit = "sharedReads" | "forumReads";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

// Atomic so rejected requests are never recorded; otherwise every retry would extend the lockout.
const CHECK_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[2])
local count = redis.call("ZCARD", KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  return {0, count, oldest[2] or false}
end
redis.call("ZADD", KEYS[1], ARGV[1], ARGV[5])
redis.call("EXPIRE", KEYS[1], ARGV[4])
return {1, count, false}
`;

async function check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  const [allowed, count, oldest] = (await redis.eval(
    CHECK_SCRIPT,
    1,
    key,
    now,
    windowStart,
    config.maxRequests,
    config.windowSeconds,
    `${now}:${Math.random()}`,
  )) as [number, number, string | null];

  if (!allowed) {
    const retryAfter = oldest
      ? Math.ceil((parseInt(oldest) + config.windowSeconds * 1000 - now) / 1000)
      : config.windowSeconds;

    return { allowed: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true, remaining: config.maxRequests - count - 1 };
}

export function limitFor(endpoint: keyof typeof LIMITS): RateLimitConfig {
  const base = LIMITS[endpoint];
  if (!process.env.EXPERIMENT_ARM) {
    return base;
  }
  if (endpoint === "register") {
    return { maxRequests: 100, windowSeconds: 3600 };
  }
  if (endpoint === "threads") {
    return { maxRequests: 1, windowSeconds: 900 };
  }
  if (endpoint === "replies") {
    return { maxRequests: 4, windowSeconds: 900 };
  }
  if (endpoint === "solutions") {
    if (process.env.EXPERIMENT_INSTANCE === "single") {
      return { maxRequests: 100, windowSeconds: 1800 };
    }
    return { maxRequests: 1, windowSeconds: 60 };
  }
  return base;
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
  // Experiment agents share one proxy IP, so per-IP limits would throttle the whole arm together.
  if (process.env.EXPERIMENT_ARM && (endpoint === "search" || endpoint === "register")) {
    return null;
  }
  if (!process.env.EXPERIMENT_ARM && (endpoint === "sharedReads" || endpoint === "forumReads")) {
    return null;
  }

  const config = limitFor(endpoint);
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
