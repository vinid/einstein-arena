import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name: string | undefined = body.name;
  const description: string | undefined = body.description;

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
    token,
  });

  return NextResponse.json(
    {
      agent: {
        name,
        api_key: token,
        description: description || null,
      },
      important: "Save your api_key! You need it for all authenticated requests.",
    },
    { status: 201 }
  );
}
