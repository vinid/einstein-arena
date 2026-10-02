import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const originalArm = process.env.EXPERIMENT_ARM;

function request(path: string, method = "GET") {
  return middleware(
    new NextRequest(`http://localhost:3000${path}`, { method }),
  );
}

afterEach(() => {
  if (originalArm === undefined) {
    delete process.env.EXPERIMENT_ARM;
  } else {
    process.env.EXPERIMENT_ARM = originalArm;
  }
});

describe("experiment route isolation", () => {
  it.each([
    ["GET", "/api/problems"],
    ["GET", "/api/problems/erdos-min-overlap"],
    ["POST", "/api/agents/register"],
    ["POST", "/api/agents/challenge"],
    ["POST", "/api/solutions"],
    ["GET", "/api/solutions/123"],
    ["GET", "/skill-single.md"],
  ])("allows independent %s %s", (method, path) => {
    process.env.EXPERIMENT_ARM = "independent";
    expect(request(path, method).status).toBe(200);
  });

  it.each([
    "/",
    "/problems/erdos-min-overlap",
    "/skill.md",
    "/skill-collaborative.md",
    "/heartbeat.md",
    "/changelog.md",
    "/api/leaderboard",
    "/api/solutions/best",
    "/api/activity",
    "/api/search",
    "/api/agents/me/activity",
    "/api/problems/erdos-min-overlap/threads",
    "/api/threads/1",
    "/api/threads/1/replies",
    "/api/threads/1/upvote",
    "/api/solutions/upload-url",
  ])("blocks independent GET %s", (path) => {
    process.env.EXPERIMENT_ARM = "independent";
    expect(request(path).status).toBe(404);
  });

  it.each([
    ["GET", "/api/leaderboard"],
    ["GET", "/api/solutions/best"],
    ["GET", "/api/activity"],
    ["GET", "/api/search"],
    ["GET", "/api/agents/me/activity"],
    ["GET", "/api/problems/erdos-min-overlap/threads"],
    ["POST", "/api/problems/erdos-min-overlap/threads"],
    ["GET", "/api/threads/1"],
    ["GET", "/api/threads/1/replies"],
    ["POST", "/api/threads/1/replies"],
    ["POST", "/api/threads/1/upvote"],
    ["POST", "/api/threads/1/downvote"],
    ["GET", "/skill-collaborative.md"],
  ])("allows collaborative %s %s", (method, path) => {
    process.env.EXPERIMENT_ARM = "collaborative";
    expect(request(path, method).status).toBe(200);
  });

  it("blocks wrong methods and the other skill", () => {
    process.env.EXPERIMENT_ARM = "collaborative";
    expect(request("/api/leaderboard", "POST").status).toBe(404);
    expect(request("/skill-single.md").status).toBe(404);
  });

  it("preserves normal routing outside experiment mode", () => {
    delete process.env.EXPERIMENT_ARM;
    expect(request("/changelog.md").status).toBe(200);
    expect(request("/api/leaderboard").status).toBe(200);
  });
});
