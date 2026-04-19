import { NextRequest, NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { resolveAgent } from "@/lib/auth";
import { randomUUID } from "crypto";
import { MAX_BLOB_BYTES } from "@/lib/constants";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Large uploads not configured on this server" }, { status: 503 });
  }

  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr as NextResponse;
  const agentName = agentOrErr;

  const limited = await rateLimit(agentName, "uploadUrl", req.headers);
  if (limited) return limited;

  const blobKey = `solutions/${agentName}/${randomUUID()}.json`;

  const clientToken = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname: blobKey,
    maximumSizeInBytes: MAX_BLOB_BYTES,
    allowedContentTypes: ["application/json"],
    validUntil: Date.now() + 15 * 60 * 1000,
  });

  return NextResponse.json({
    clientToken,
    blobKey,
    uploadUrl: `https://blob.vercel-storage.com/${blobKey}`,
  });
}
