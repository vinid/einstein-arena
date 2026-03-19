import { describe, it, expect } from "vitest";
import { decideDisposition } from "../../../lib/evaluate";

const MIN = { scoring: "minimize", minImprovement: 0.01 };
const MAX = { scoring: "maximize", minImprovement: 0.01 };

describe("decideDisposition — minimize", () => {
  it("first submission, no global best → new_first", () => {
    expect(decideDisposition(0.5, null, null, MIN)).toBe("new_first");
  });

  it("first submission, beats global best by enough → new_first", () => {
    expect(decideDisposition(0.38, 0.40, null, MIN)).toBe("new_first");
  });

  it("first submission, beats global best but below minImprovement → rejected_min_improvement", () => {
    expect(decideDisposition(0.395, 0.40, null, MIN)).toBe("rejected_min_improvement");
  });

  it("first submission, worse than global best → rejected_min_improvement", () => {
    expect(decideDisposition(0.45, 0.40, null, MIN)).toBe("rejected_min_improvement");
  });

  it("first submission, exactly at global best → rejected_min_improvement", () => {
    expect(decideDisposition(0.40, 0.40, null, MIN)).toBe("rejected_min_improvement");
  });

  it("subsequent submission, beats personal best by enough → accepted", () => {
    expect(decideDisposition(0.35, 0.30, { id: 1, score: 0.38 }, MIN)).toBe("accepted");
  });

  it("subsequent submission, beats personal best but below minImprovement → rejected_min_improvement", () => {
    expect(decideDisposition(0.375, 0.30, { id: 1, score: 0.38 }, MIN)).toBe("rejected_min_improvement");
  });

  it("subsequent submission, same as personal best → discarded_personal", () => {
    expect(decideDisposition(0.38, 0.30, { id: 1, score: 0.38 }, MIN)).toBe("discarded_personal");
  });

  it("subsequent submission, worse than personal best → discarded_personal", () => {
    expect(decideDisposition(0.42, 0.30, { id: 1, score: 0.38 }, MIN)).toBe("discarded_personal");
  });

  it("subsequent submission, beats global best by enough → new_first", () => {
    expect(decideDisposition(0.38, 0.40, { id: 1, score: 0.42 }, MIN)).toBe("new_first");
  });

  it("subsequent submission, beats global best but below minImprovement → rejected_min_improvement", () => {
    expect(decideDisposition(0.395, 0.40, { id: 1, score: 0.42 }, MIN)).toBe("rejected_min_improvement");
  });
});

describe("decideDisposition — maximize", () => {
  it("first submission, no global best → new_first", () => {
    expect(decideDisposition(0.5, null, null, MAX)).toBe("new_first");
  });

  it("first submission, beats global best by enough → new_first", () => {
    expect(decideDisposition(0.42, 0.40, null, MAX)).toBe("new_first");
  });

  it("first submission, worse than global best → rejected_min_improvement", () => {
    expect(decideDisposition(0.35, 0.40, null, MAX)).toBe("rejected_min_improvement");
  });

  it("first submission, beats global best but below minImprovement → rejected_min_improvement", () => {
    expect(decideDisposition(0.405, 0.40, null, MAX)).toBe("rejected_min_improvement");
  });

  it("subsequent submission, beats personal best by enough → accepted", () => {
    expect(decideDisposition(0.50, 0.70, { id: 1, score: 0.38 }, MAX)).toBe("accepted");
  });

  it("subsequent submission, beats personal best but below minImprovement → rejected_min_improvement", () => {
    expect(decideDisposition(0.385, 0.70, { id: 1, score: 0.38 }, MAX)).toBe("rejected_min_improvement");
  });

  it("subsequent submission, worse than personal best → discarded_personal", () => {
    expect(decideDisposition(0.35, 0.70, { id: 1, score: 0.38 }, MAX)).toBe("discarded_personal");
  });
});
