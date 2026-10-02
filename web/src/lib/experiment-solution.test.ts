import { describe, expect, it } from "vitest";
import { experimentValueError } from "./experiment-solution";

const kissing = (vectors: unknown) =>
  experimentValueError("kissing-number-d11-605", { vectors });

const validVectors = () =>
  Array.from({ length: 605 }, (_, i) =>
    Array.from({ length: 11 }, (_, k) => (k === i % 11 ? 1 : 0)),
  );

describe("experiment solution validation", () => {
  it("accepts a bounded overlap array", () => {
    expect(experimentValueError("erdos-min-overlap", { values: [0, 0.5, 1] })).toBeNull();
  });

  it("rejects missing, out-of-range, and oversized overlap arrays", () => {
    expect(experimentValueError("erdos-min-overlap", { set: [0, 1] })).toMatch(/values is required/);
    expect(experimentValueError("erdos-min-overlap", { values: [-0.1] })).toMatch(/0 through 1/);
    expect(experimentValueError("erdos-min-overlap", { values: [] })).toMatch(/1 to 100000/);
  });

  it("accepts 605 non-zero vectors in R^11, including decimal strings", () => {
    const vectors: unknown[][] = validVectors();
    vectors[0][3] = "-0.25";
    vectors[1][2] = "1e-30";
    expect(kissing(vectors)).toBeNull();
  });

  it("rejects wrong shapes, zero vectors, and bad components", () => {
    expect(experimentValueError("kissing-number-d11-605", {})).toMatch(/vectors is required/);
    expect(kissing(validVectors().slice(1))).toMatch(/exactly 605 vectors/);

    const short = validVectors();
    short[4] = short[4].slice(1);
    expect(kissing(short)).toMatch(/vectors\[4\] must contain exactly 11/);

    const zero: unknown[][] = validVectors();
    zero[7] = Array(11).fill(0);
    expect(kissing(zero)).toMatch(/vectors\[7\] must be non-zero/);

    const zeroString: unknown[][] = validVectors();
    zeroString[8] = Array(11).fill("0.000e5");
    expect(kissing(zeroString)).toMatch(/vectors\[8\] must be non-zero/);

    const infinite: unknown[][] = validVectors();
    infinite[2][0] = Infinity;
    expect(kissing(infinite)).toMatch(/finite numbers/);

    const text: unknown[][] = validVectors();
    text[3][0] = "abc";
    expect(kissing(text)).toMatch(/not a decimal number/);
  });

  it("validates kissing-number-d11 as 594 vectors", () => {
    const vectors = validVectors().slice(0, 594);
    expect(experimentValueError("kissing-number-d11", { vectors })).toBeNull();
    expect(experimentValueError("kissing-number-d11", { vectors: validVectors() })).toMatch(
      /exactly 594 vectors/,
    );
  });

  it("fails loudly for problems without experiment validation", () => {
    expect(() => experimentValueError("circle-packing", {})).toThrow(/no experiment validation/);
  });
});
