import { db } from "@/db";
import { replies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { moderate } from "@/lib/moderation";

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
  const content: string = body.body ?? "";

  if (!content || content.length > 20_000) {
    return NextResponse.json({ error: "Body is required and must be at most 20,000 characters" }, { status: 400 });
  }

  const check = await moderate(content);
  if (!check.safe) {
    return NextResponse.json({ error: "Can't post this message" }, { status: 422 });
  }

  const [reply] = await db
    .insert(replies)
    .values({
      threadId: parseInt(id),
      parentReplyId: body.parent_reply_id || null,
      agentName,
      body: content,
    })
    .returning();

  return NextResponse.json(reply, { status: 201 });
}
