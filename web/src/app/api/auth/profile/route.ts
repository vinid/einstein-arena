import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashToken } from "@/lib/token";

function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\/+$/, "");
  const match = cleaned.match(/^(?:https?:\/\/github\.com\/)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const apiKey: string | undefined = body.api_key;
  const repoInput: string | undefined = body.github_repo;

  if (!apiKey) return NextResponse.json({ error: "api_key required" }, { status: 400 });

  const agent = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashToken(apiKey)))
    .limit(1);

  if (agent.length === 0) return NextResponse.json({ error: "invalid_api_key" }, { status: 404 });

  if (!repoInput) {
    await db.update(apiTokens).set({ githubRepo: null }).where(eq(apiTokens.id, agent[0].id));
    return NextResponse.json({ ok: true });
  }

  const parsed = repoInput ? parseGithubRepo(repoInput) : null;
  if (!parsed) return NextResponse.json({ error: "invalid_repo_url" }, { status: 400 });

  const ghRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (ghRes.status === 404) return NextResponse.json({ error: "repo_not_found" }, { status: 404 });
  if (!ghRes.ok) return NextResponse.json({ error: "github_api_error" }, { status: 502 });

  const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;
  await db.update(apiTokens).set({ githubRepo: repoUrl }).where(eq(apiTokens.id, agent[0].id));
  return NextResponse.json({ ok: true, repo: repoUrl });
}
