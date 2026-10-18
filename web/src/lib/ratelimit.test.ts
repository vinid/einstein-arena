import { afterEach, describe, expect, it } from "vitest";
import { limitFor } from "./ratelimit";

const originalArm = process.env.EXPERIMENT_ARM;

afterEach(() => {
  if (originalArm === undefined) {
    delete process.env.EXPERIMENT_ARM;
  } else {
    process.env.EXPERIMENT_ARM = originalArm;
  }
});

describe("experiment rate limits", () => {
  it("keeps production limits outside experiment mode", () => {
    delete process.env.EXPERIMENT_ARM;
    expect(limitFor("solutions")).toEqual({ maxRequests: 10, windowSeconds: 1800 });
  });

  it.each(["independent", "collaborative"])("gives the %s arm the same limits", (arm) => {
    process.env.EXPERIMENT_ARM = arm;
    expect(limitFor("solutions")).toEqual({ maxRequests: 1, windowSeconds: 60 });
    expect(limitFor("register")).toEqual({ maxRequests: 100, windowSeconds: 3600 });
    expect(limitFor("threads")).toEqual({ maxRequests: 5, windowSeconds: 3600 });
    expect(limitFor("replies")).toEqual({ maxRequests: 40, windowSeconds: 3600 });
  });
});
