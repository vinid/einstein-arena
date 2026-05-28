import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashToken } from "@/lib/token";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.BASE_URL!;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("oauth_state")?.value;
  const apiKey = req.cookies.get("oauth_api_key")?.value;

  const fail = (msg: string) => {
    const url = new URL("/profile", baseUrl);
    url.searchParams.set("error", msg);
    return NextResponse.redirect(url.toString());
  };

  if (!code || !state || !storedState || !apiKey) return fail("missing_params");
  if (state !== storedState) return fail("state_mismatch");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${baseUrl}/api/auth/github/callback`,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return fail("github_token_failed");

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });

  const ghUser = await userRes.json();
  if (!ghUser.id) return fail("github_user_failed");

  const tokenHash = hashToken(apiKey);
  const agent = await db
    .select({ id: apiTokens.id, agentName: apiTokens.agentName, githubId: apiTokens.githubId })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  if (agent.length === 0) return fail("invalid_api_key");

  const conflict = await db
    .select({ agentName: apiTokens.agentName })
    .from(apiTokens)
    .where(eq(apiTokens.githubId, String(ghUser.id)))
    .limit(1);

  if (conflict.length > 0 && conflict[0].agentName !== agent[0].agentName) {
    return fail("github_already_linked");
  }

  try {
    await db
      .update(apiTokens)
      .set({
        githubId: String(ghUser.id),
        githubUsername: ghUser.login,
        githubAvatarUrl: ghUser.avatar_url,
      })
      .where(eq(apiTokens.id, agent[0].id));
  } catch (e: any) {
    if (e?.cause?.code === "23505") return fail("github_already_linked");
    throw e;
  }

  const successUrl = new URL("/profile", baseUrl);
  successUrl.searchParams.set("connected", agent[0].agentName);
  const res = NextResponse.redirect(successUrl.toString());
  res.cookies.delete("oauth_state");
  res.cookies.delete("oauth_api_key");
  return res;
}
