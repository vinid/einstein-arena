import { afterEach, describe, expect, it } from "vitest";
import { limitFor, rateLimit } from "./ratelimit";

const originalArm = process.env.EXPERIMENT_ARM;
const originalInstance = process.env.EXPERIMENT_INSTANCE;

afterEach(() => {
  if (originalArm === undefined) {
    delete process.env.EXPERIMENT_ARM;
  } else {
    process.env.EXPERIMENT_ARM = originalArm;
  }
  if (originalInstance === undefined) {
    delete process.env.EXPERIMENT_INSTANCE;
  } else {
    process.env.EXPERIMENT_INSTANCE = originalInstance;
  }
});

describe("experiment rate limits", () => {
  it("keeps production limits outside experiment mode", () => {
    delete process.env.EXPERIMENT_ARM;
    expect(limitFor("solutions")).toEqual({ maxRequests: 10, windowSeconds: 1800 });
  });

  it("gives the single agent the aggregate submission allowance", () => {
    process.env.EXPERIMENT_ARM = "independent";
    process.env.EXPERIMENT_INSTANCE = "single";
    expect(limitFor("solutions")).toEqual({ maxRequests: 100, windowSeconds: 1800 });
  });

  it("caps each distributed agent at five submissions per ten minutes", () => {
    process.env.EXPERIMENT_ARM = "collaborative";
    process.env.EXPERIMENT_INSTANCE = "collaborative";
    expect(limitFor("solutions")).toEqual({ maxRequests: 1, windowSeconds: 60 });
    expect(limitFor("threads")).toEqual({ maxRequests: 1, windowSeconds: 900 });
    expect(limitFor("replies")).toEqual({ maxRequests: 4, windowSeconds: 900 });
    expect(limitFor("register")).toEqual({ maxRequests: 100, windowSeconds: 3600 });
    expect(limitFor("sharedReads")).toEqual({ maxRequests: 20, windowSeconds: 900 });
    expect(limitFor("forumReads")).toEqual({ maxRequests: 60, windowSeconds: 900 });
  });

  it("does not limit reads outside experiment mode", async () => {
    delete process.env.EXPERIMENT_ARM;
    expect(await rateLimit("agent", "sharedReads")).toBeNull();
    expect(await rateLimit("agent", "forumReads")).toBeNull();
  });
});
