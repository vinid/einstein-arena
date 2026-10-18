import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateLocally } from "./local-evaluate";
import erdosMinOverlap from "./problems/erdos-min-overlap";

const originalPython = process.env.EXPERIMENT_PYTHON;

beforeEach(() => {
  delete process.env.EXPERIMENT_PYTHON;
});

afterEach(() => {
  if (originalPython === undefined) {
    delete process.env.EXPERIMENT_PYTHON;
  } else {
    process.env.EXPERIMENT_PYTHON = originalPython;
  }
});

describe("evaluateLocally", () => {
  it("returns the verifier score", async () => {
    const score = await evaluateLocally(
      "def evaluate(solution):\n    return solution['value'] * 2",
      { value: 3.5 },
    );

    expect(score).toBe(7);
  });

  it("rejects verifier exceptions", async () => {
    await expect(
      evaluateLocally(
        "def evaluate(solution):\n    raise ValueError('invalid candidate')",
        {},
      ),
    ).rejects.toThrow("invalid candidate");
  });

  it("rejects non-finite scores", async () => {
    await expect(
      evaluateLocally("def evaluate(solution):\n    return float('inf')", {}),
    ).rejects.toThrow("non-finite");
  });

  it("runs the experiment problem verifier", async () => {
    const score = await evaluateLocally(erdosMinOverlap.verifier, {
      values: [0, 1, 0, 1],
    });

    expect(score).toBe(1);
  });
});
