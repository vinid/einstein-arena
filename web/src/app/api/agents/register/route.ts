import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { hashToken } from "@/lib/token";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const rl = await rateLimit(getClientIp(req.headers), "register", req.headers);
  if (rl) return rl;

  const body = await req.json();
  const name: string | undefined = body.name;

  if (!name || name.length < 2 || name.length > 30) {
    return NextResponse.json(
      { error: "Name must be 2-30 characters" },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return NextResponse.json(
      { error: "Name must be alphanumeric (dashes and underscores allowed)" },
      { status: 400 }
    );
  }

  const existing = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(eq(apiTokens.agentName, name))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Agent name already taken" },
      { status: 409 }
    );
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
