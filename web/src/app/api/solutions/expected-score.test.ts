import { describe, it, expect } from "vitest";
import { decideDisposition } from "../../../lib/evaluate";

const MIN = { scoring: "minimize", minImprovement: 0.01 };
const MAX = { scoring: "maximize", minImprovement: 0.01 };

describe("expected_score pre-filter — minimize", () => {
  it("new agent, score beats global best by enough → would be new_first (allow)", () => {
    const d = decideDisposition(0.38, 0.40, null, MIN);
    expect(d).toBe("new_first");
  });

  it("new agent, score beats global best but below threshold → rejected", () => {
    const d = decideDisposition(0.395, 0.40, null, MIN);
    expect(d).toBe("rejected_min_improvement");
  });

  it("new agent, score exactly ties global best → rejected", () => {
    const d = decideDisposition(0.40, 0.40, null, MIN);
    expect(d).toBe("rejected_min_improvement");
  });

  it("new agent, score worse than global best → accepted (first entry for agent)", () => {
    const d = decideDisposition(0.45, 0.40, null, MIN);
    expect(d).toBe("accepted");
  });

  it("new agent, no global best at all → new_first", () => {
    const d = decideDisposition(0.99, null, null, MIN);
    expect(d).toBe("new_first");
  });

  it("existing agent, score improves personal best by enough → accepted", () => {
    const d = decideDisposition(0.35, 0.30, { id: 1, score: 0.38 }, MIN);
    expect(d).toBe("accepted");
  });

  it("existing agent, score improves personal best below threshold → rejected", () => {
    const d = decideDisposition(0.375, 0.30, { id: 1, score: 0.38 }, MIN);
    expect(d).toBe("rejected_min_improvement");
  });

  it("existing agent, score equal to personal best → discarded", () => {
    const d = decideDisposition(0.38, 0.30, { id: 1, score: 0.38 }, MIN);
    expect(d).toBe("discarded_personal");
  });

  it("existing agent, score worse than personal best → discarded", () => {
    const d = decideDisposition(0.42, 0.30, { id: 1, score: 0.38 }, MIN);
    expect(d).toBe("discarded_personal");
  });

  it("existing agent, score would be new #1 by enough → new_first", () => {
    const d = decideDisposition(0.28, 0.30, { id: 1, score: 0.30 }, MIN);
    expect(d).toBe("new_first");
  });

  it("existing agent, score would be new #1 below threshold → rejected", () => {
    const d = decideDisposition(0.295, 0.30, { id: 1, score: 0.30 }, MIN);
    expect(d).toBe("rejected_min_improvement");
  });
});

describe("expected_score pre-filter — maximize", () => {
  it("new agent, score beats global best by enough → new_first", () => {
    const d = decideDisposition(0.42, 0.40, null, MAX);
    expect(d).toBe("new_first");
  });

  it("new agent, score beats global best below threshold → rejected", () => {
    const d = decideDisposition(0.405, 0.40, null, MAX);
    expect(d).toBe("rejected_min_improvement");
  });

  it("new agent, score exactly ties global best → rejected", () => {
    const d = decideDisposition(0.40, 0.40, null, MAX);
    expect(d).toBe("rejected_min_improvement");
  });

  it("new agent, score worse than global best → accepted", () => {
    const d = decideDisposition(0.35, 0.40, null, MAX);
    expect(d).toBe("accepted");
  });

  it("existing agent, score improves personal best by enough → accepted", () => {
    const d = decideDisposition(0.50, 0.70, { id: 1, score: 0.38 }, MAX);
    expect(d).toBe("accepted");
  });

  it("existing agent, score improves personal best below threshold → rejected", () => {
    const d = decideDisposition(0.385, 0.70, { id: 1, score: 0.38 }, MAX);
    expect(d).toBe("rejected_min_improvement");
  });

  it("existing agent, score worse than personal best → discarded", () => {
    const d = decideDisposition(0.35, 0.70, { id: 1, score: 0.38 }, MAX);
    expect(d).toBe("discarded_personal");
  });
});

describe("expected_score pre-filter — API behavior mapping", () => {
  it("rejected_min_improvement should trigger 409", () => {
    const d = decideDisposition(0.395, 0.40, null, MIN);
    expect(d).toBe("rejected_min_improvement");
  });

  it("discarded_personal should trigger 409", () => {
    const d = decideDisposition(0.42, 0.30, { id: 1, score: 0.38 }, MIN);
    expect(d).toBe("discarded_personal");
  });

  it("accepted should NOT trigger 409", () => {
    const d = decideDisposition(0.45, 0.40, null, MIN);
    expect(d).not.toBe("rejected_min_improvement");
    expect(d).not.toBe("discarded_personal");
  });

  it("new_first should NOT trigger 409", () => {
    const d = decideDisposition(0.38, 0.40, null, MIN);
    expect(d).not.toBe("rejected_min_improvement");
    expect(d).not.toBe("discarded_personal");
  });
});
