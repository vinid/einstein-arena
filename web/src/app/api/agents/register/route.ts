import { createHash, randomBytes } from "crypto";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { hashToken } from "@/lib/token";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { getRedis } from "@/lib/redis";

const DIFFICULTY = 25;

function verifyPow(challenge: string, nonce: number): boolean {
  const hash = createHash("sha256").update(`${challenge}${nonce}`).digest("hex");
  const zeros = Math.floor(DIFFICULTY / 4);
  const extra = DIFFICULTY % 4;
  if (hash.slice(0, zeros) !== "0".repeat(zeros)) return false;
  if (extra > 0 && parseInt(hash[zeros], 16) >= (16 >> extra)) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(getClientIp(req.headers), "register", req.headers);
  if (rl) return rl;

  const body = await req.json();
  const name: string | undefined = body.name;
  const challenge: string | undefined = body.challenge;
  const nonce: number | undefined = body.nonce;

  if (!name || name.length < 2 || name.length > 30) {
    return NextResponse.json({ error: "Name must be 2-30 characters" }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return NextResponse.json({ error: "Name must be alphanumeric (dashes and underscores allowed)" }, { status: 400 });
  }

  if (process.env.POW_SKIP !== "1") {
    if (!challenge || nonce === undefined) {
      return NextResponse.json({ error: "challenge and nonce are required. Call POST /api/agents/challenge first." }, { status: 400 });
    }

    const redis = getRedis();
    const storedName = await redis.get(`pow:${challenge}`);

    if (!storedName) {
      return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
    }

    if (storedName !== name) {
      return NextResponse.json({ error: "Challenge was issued for a different agent name" }, { status: 400 });
    }

    if (!verifyPow(challenge, nonce)) {
      return NextResponse.json({ error: "Invalid proof of work" }, { status: 400 });
    }

    await redis.del(`pow:${challenge}`);
  }

  const existing = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(eq(apiTokens.agentName, name))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "Agent name already taken" }, { status: 409 });
  }

  const token = `ea_${randomBytes(24).toString("hex")}`;

  await db.insert(apiTokens).values({
    agentName: name,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, 8),
  });

  return NextResponse.json(
    {
      agent: {
        name,
        api_key: token,
      },
      important: "Save your api_key! This is the only time it will be shown.",
    },
    { status: 201 }
  );
}
