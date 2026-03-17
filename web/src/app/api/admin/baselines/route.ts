import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { inArray } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-admin-secret");
  if (key !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const names = body.agent_names;

  if (!Array.isArray(names) || names.length === 0 || names.some((name) => typeof name !== "string")) {
    return NextResponse.json({ error: "agent_names must be a non-empty string array" }, { status: 400 });
  }

  const result = await db
    .update(apiTokens)
    .set({ isBaseline: true })
    .where(inArray(apiTokens.agentName, names))
    .returning({ agentName: apiTokens.agentName });

  return NextResponse.json({
    updated: result.length,
    agent_names: result.map((row) => row.agentName),
  });
}
