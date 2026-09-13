import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import noThreeInLine75 from "./no-three-in-line-75";

function evaluate(points: unknown): number {
  const script = `${noThreeInLine75.verifier}
import json
import sys
print(evaluate(json.loads(sys.argv[1])))`;
  const result = spawnSync(
    "python3",
    ["-c", script, JSON.stringify({ points })],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return Number(result.stdout.trim());
}

describe("no-three-in-line-75", () => {
  it("accepts a finite-field parabola construction", () => {
    const points = Array.from({ length: 73 }, (_, x) => [x, (x * x) % 73]);
    expect(noThreeInLine75.zodSchema.safeParse({ points }).success).toBe(true);
    expect(evaluate(points)).toBe(73);
  });

  it("rejects collinearity at a nonstandard slope", () => {
    expect(() => evaluate([[0, 0], [2, 1], [4, 2]])).toThrow(
      "Three points are collinear",
    );
  });

  it("rejects duplicate points", () => {
    const points = [[0, 0], [1, 2], [0, 0]];
    expect(noThreeInLine75.zodSchema.safeParse({ points }).success).toBe(false);
    expect(() => evaluate(points)).toThrow("Points must be distinct");
  });

  it("rejects booleans and noninteger coordinates", () => {
    expect(() => evaluate([[true, 0]])).toThrow(
      "Coordinates must be integers",
    );
    expect(() => evaluate([[1.5, 2]])).toThrow(
      "Coordinates must be integers",
    );
  });

  it("rejects out-of-grid coordinates", () => {
    expect(noThreeInLine75.zodSchema.safeParse({ points: [[75, 0]] }).success)
      .toBe(false);
    expect(() => evaluate([[75, 0]])).toThrow(
      "Coordinates must lie in [0, 74]",
    );
  });

  it("rejects more than 150 points before checking geometry", () => {
    const points = Array.from(
      { length: 151 },
      (_, index) => [index % 75, Math.floor(index / 75)],
    );
    expect(noThreeInLine75.zodSchema.safeParse({ points }).success).toBe(false);
    expect(() => evaluate(points)).toThrow(
      "Expected between 1 and 150 points",
    );
  });
});
