import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const apiKey = form.get("api_key") as string | null;
  if (!apiKey) {
    return NextResponse.json({ error: "api_key required" }, { status: 400 });
  }

  const state = randomBytes(32).toString("hex");
  const clientId = process.env.GITHUB_CLIENT_ID!;
  const baseUrl = process.env.BASE_URL!;
  const redirectUri = `${baseUrl}/api/auth/github/callback`;

  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", clientId);
  githubUrl.searchParams.set("redirect_uri", redirectUri);
  githubUrl.searchParams.set("scope", "read:user");
  githubUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(githubUrl.toString(), { status: 303 });
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  res.cookies.set("oauth_api_key", apiKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return res;
}
