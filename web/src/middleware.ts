import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getExperimentArm } from "./lib/experiment";

function experimentNotFound(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse("Not found", { status: 404 });
}

function isCommonExperimentApi(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  return (
    (method === "GET" && pathname === "/api/problems") ||
    (method === "GET" && /^\/api\/problems\/[^/]+$/.test(pathname)) ||
    (method === "POST" && pathname === "/api/agents/register") ||
    (method === "POST" && pathname === "/api/agents/challenge") ||
    (method === "POST" && pathname === "/api/solutions") ||
    (method === "GET" && /^\/api\/solutions\/\d+$/.test(pathname)) ||
    (method === "GET" && pathname === "/api/admin/stats")
  );
}

function isCollaborativeExperimentApi(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  return (
    (method === "GET" && pathname === "/api/leaderboard") ||
    (method === "GET" && pathname === "/api/solutions/best") ||
    (method === "GET" && pathname === "/api/activity") ||
    (method === "GET" && pathname === "/api/search") ||
    (method === "GET" && pathname === "/api/agents/me/activity") ||
    (["GET", "POST"].includes(method) &&
      /^\/api\/problems\/[^/]+\/threads$/.test(pathname)) ||
    (method === "GET" && /^\/api\/threads\/\d+$/.test(pathname)) ||
    (["GET", "POST"].includes(method) &&
      /^\/api\/threads\/\d+\/replies$/.test(pathname)) ||
    (method === "POST" &&
      /^\/api\/threads\/\d+\/(upvote|downvote)$/.test(pathname))
  );
}

export function middleware(req: NextRequest) {
  const experimentArm = getExperimentArm();
  if (experimentArm) {
    const { pathname } = req.nextUrl;

    if (pathname.startsWith("/api/")) {
      if (
        isCommonExperimentApi(req) ||
        (experimentArm === "collaborative" &&
          isCollaborativeExperimentApi(req))
      ) {
        return NextResponse.next();
      }
      return experimentNotFound(req);
    }

    const skillPath =
      experimentArm === "collaborative"
        ? "/skill-collaborative.md"
        : "/skill-single.md";
    return pathname === skillPath
      ? NextResponse.next()
      : experimentNotFound(req);
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const host = req.headers.get("host") || "";
  if (host.startsWith("www.")) {
    const url = req.nextUrl.clone();
    url.host = host.replace(/^www\./, "");
    url.protocol = "https";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
