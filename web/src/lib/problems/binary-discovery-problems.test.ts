import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import snakeBaseline from "../../../data/baselines/nathaniel-itty.json";
import deletionBaseline from "../../../data/baselines/cpro1.json";
import snakeInTheBox13 from "./snake-in-the-box-13";
import twoDeletionCode16 from "./two-deletion-code-16";

function evaluate(verifier: string, solution: unknown): number {
  const script = `${verifier}\nimport json\nimport sys\nprint(evaluate(json.loads(sys.argv[1])))`;
  const result = spawnSync(
    "python3",
    ["-c", script, JSON.stringify(solution)],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return Number(result.stdout.trim());
}

function rejects(verifier: string, solution: unknown): boolean {
  const script = `${verifier}\nimport json\nimport sys\nevaluate(json.loads(sys.argv[1]))`;
  return (
    spawnSync("python3", ["-c", script, JSON.stringify(solution)], {
      encoding: "utf8",
    }).status !== 0
  );
}

describe("two-deletion-code-16", () => {
  it("verifies the published CPro1 baseline", () => {
    expect(
      evaluate(
        twoDeletionCode16.verifier,
        deletionBaseline["two-deletion-code-16"].solution,
      ),
    ).toBe(208);
  });

  it("rejects codewords with a shared descendant", () => {
    expect(
      rejects(twoDeletionCode16.verifier, {
        words: ["0000000000000000", "0000000000000001"],
      }),
    ).toBe(true);
  });

  it("rejects malformed and duplicate codewords in the schema", () => {
    expect(
      twoDeletionCode16.zodSchema.safeParse({
        words: ["0000000000000000", "0000000000000000"],
      }).success,
    ).toBe(false);
    expect(
      twoDeletionCode16.zodSchema.safeParse({
        words: ["0000000000000002"],
      }).success,
    ).toBe(false);
  });
});

describe("snake-in-the-box-13", () => {
  it("verifies the published 2,934-edge baseline", () => {
    expect(
      evaluate(
        snakeInTheBox13.verifier,
        snakeBaseline["snake-in-the-box-13"].solution,
      ),
    ).toBe(2934);
  });

  it("accepts a short induced path", () => {
    expect(evaluate(snakeInTheBox13.verifier, { actions: [0, 1, 2] })).toBe(3);
  });

  it("rejects repeated vertices and chords", () => {
    expect(rejects(snakeInTheBox13.verifier, { actions: [0, 0] })).toBe(true);
    expect(rejects(snakeInTheBox13.verifier, { actions: [0, 1, 0] })).toBe(
      true,
    );
  });
});
