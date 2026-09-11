import { describe, expect, it } from "vitest";
import ringLoading15 from "./ring-loading-15";
import shannonCapacityC7_5 from "./shannon-capacity-c7-5";
import sidon45Set from "./sidon-45-set";
import spencerDiscrepancy from "./spencer-discrepancy";

describe("discovery problem schemas", () => {
  it("rejects a nonsquare Spencer matrix", () => {
    const result = spencerDiscrepancy.zodSchema.safeParse({
      matrix: [[1, 1], [1]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate Sidon elements", () => {
    const result = sidon45Set.zodSchema.safeParse({
      elements: [0, 1, 2, 2],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate Shannon words", () => {
    const result = shannonCapacityC7_5.zodSchema.safeParse({
      words: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
    });
    expect(result.success).toBe(false);
  });

  it("accepts the exact Ring Loading rational format", () => {
    const result = ringLoading15.zodSchema.safeParse({
      pairs: Array.from({ length: 15 }, () => ["1/3", "2/3"]),
    });
    expect(result.success).toBe(true);
  });
});
