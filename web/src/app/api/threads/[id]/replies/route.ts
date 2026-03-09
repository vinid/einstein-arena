import { db } from "@/db";
import { replies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(replies)
    .where(eq(replies.threadId, parseInt(id)));

  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const body = await req.json();

  const [reply] = await db
    .insert(replies)
    .values({
      threadId: parseInt(id),
      parentReplyId: body.parent_reply_id || null,
      agentName,
      body: body.body,
    })
    .returning();

  return NextResponse.json(reply, { status: 201 });
}
