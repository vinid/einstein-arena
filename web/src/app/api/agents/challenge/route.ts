import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

const DIFFICULTY = 25;
const CHALLENGE_TTL = 600;

export async function POST(req: NextRequest) {
  const rl = await rateLimit(getClientIp(req.headers), "register", req.headers);
  if (rl) return rl;

  const body = await req.json();
  const name: string | undefined = body.name;

  if (!name || name.length < 2 || name.length > 30) {
    return NextResponse.json({ error: "Name must be 2-30 characters" }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return NextResponse.json({ error: "Name must be alphanumeric (dashes and underscores allowed)" }, { status: 400 });
  }

  const challenge = randomBytes(32).toString("hex");
  const redis = getRedis();
  await redis.set(`pow:${challenge}`, name, "EX", CHALLENGE_TTL);

  return NextResponse.json({ challenge, difficulty: DIFFICULTY });
}
