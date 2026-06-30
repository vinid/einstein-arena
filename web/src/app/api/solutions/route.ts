import { db } from "@/db";
import { solutions } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { solutionSchemas } from "@/lib/problems";
import { logAgentEvent } from "@/lib/agent-log";
import { getActiveProblemById } from "@/lib/problem-utils";
import { del, list } from "@vercel/blob";
import { MAX_BLOB_BYTES } from "@/lib/constants";

const SUBMISSIONS_DISABLED_SLUGS = new Set(["kissing-number-d11", "kissing-number-d12"]);

export async function POST(req: NextRequest) {
  const agentOrErr = await resolveAgent(req);
  if (typeof agentOrErr !== "string") return agentOrErr;
  const agentName = agentOrErr;

  const rl = await rateLimit(agentName, "solutions", req.headers);
  if (rl) {
    console.warn(`[solutions] 429 agent=${agentName} rate limited`);
    return rl;
  }

  const body = await req.json();

  if (!body.problem_id || typeof body.problem_id !== "number") {
    return NextResponse.json({ error: "problem_id is required and must be a number" }, { status: 400 });
  }

  const problem = await getActiveProblemById(body.problem_id);

  if (!problem) {
    console.warn(`[solutions] 404 agent=${agentName} problem_id=${body.problem_id} not found`);
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  if (SUBMISSIONS_DISABLED_SLUGS.has(problem.slug)) {
    console.warn(`[solutions] 409 agent=${agentName} problem=${problem.slug} submissions disabled`);
    return NextResponse.json({ error: "Submissions are disabled for this problem" }, { status: 409 });
  }

  let sol = body.solution;
  let blobUrlToDelete: string | null = null;

  if (!sol && body.solution_blob_key) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Large uploads not configured on this server" }, { status: 503 });
    }
    const blobKey: string = body.solution_blob_key;
    if (!blobKey.startsWith(`solutions/${agentName}/`) || !blobKey.endsWith(".json")) {
      return NextResponse.json({ error: "Invalid blob key" }, { status: 400 });
    }
    const keyPrefix = blobKey.endsWith(".json") ? blobKey.slice(0, -5) : blobKey;
    const { blobs } = await list({ prefix: keyPrefix, limit: 1 });
    const blobMeta = blobs.find(b => b.pathname.startsWith(keyPrefix) && b.pathname.endsWith(".json"));
    if (!blobMeta) {
      return NextResponse.json({ error: "Blob not found" }, { status: 400 });
    }
    if (blobMeta.size > MAX_BLOB_BYTES) {
      del(blobMeta.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
      return NextResponse.json({ error: "Solution blob exceeds maximum allowed size" }, { status: 400 });
    }
    const blobRes = await fetch(blobMeta.url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!blobRes.ok) {
      del(blobMeta.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
      return NextResponse.json({ error: "Failed to fetch solution from blob storage" }, { status: 400 });
    }
    let text: string;
    try {
      text = new TextDecoder().decode(await blobRes.arrayBuffer());
      sol = JSON.parse(text);
    } catch {
      del(blobMeta.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
      return NextResponse.json({ error: "Blob content is not valid JSON" }, { status: 400 });
    }
    blobUrlToDelete = blobMeta.url;
  }

  if (!sol || typeof sol !== "object") {
    if (blobUrlToDelete) del(blobUrlToDelete, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
    return NextResponse.json({ error: "solution is required and must be an object" }, { status: 400 });
  }

  const schema = solutionSchemas[problem.slug];
  if (schema) {
    const result = schema.safeParse(sol);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue.path.length ? issue.path.join(".") : "";
      const msg = path ? `solution.${path}: ${issue.message}` : issue.message;
      console.warn(`[solutions] 400 agent=${agentName} problem=${problem.slug} schema error: ${msg}`);
      if (blobUrlToDelete) del(blobUrlToDelete, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (!blobUrlToDelete) {
    const dataStr = JSON.stringify(sol);
    if (dataStr.length > 2_000_000) {
      return NextResponse.json({ error: "Solution data must be under 2 MB" }, { status: 400 });
    }
  }

  const bypassToken = process.env.RATE_LIMIT_BYPASS_TOKEN;
  const isBypassed = bypassToken && req.headers.get("x-ratelimit-bypass") === bypassToken;
  const precomputedScore = isBypassed && typeof body.score === "number" ? body.score : null;

  const [solution] = await db
    .insert(solutions)
    .values({
      problemId: body.problem_id,
      agentName,
      data: sol,
      code: null,
      ...(precomputedScore !== null ? { status: "evaluated", score: precomputedScore, evaluatedAt: new Date() } : {}),
    })
    .returning({ id: solutions.id, status: solutions.status, score: solutions.score });

  if (blobUrlToDelete) {
    del(blobUrlToDelete, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch((err) => {
      console.error("[solutions] failed to delete blob", blobUrlToDelete, err);
    });
  }

  logAgentEvent(agentName, "submission", "/api/solutions", 201, { problem_id: body.problem_id, slug: problem.slug, solution_id: solution.id });
  return NextResponse.json(solution, { status: 201 });
}
