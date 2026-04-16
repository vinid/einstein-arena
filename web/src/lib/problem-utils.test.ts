import { describe, it, expect, vi } from "vitest";
import { asc, desc } from "drizzle-orm";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  problems: { hidden: { name: "hidden" }, slug: { name: "slug" }, id: { name: "id" } },
  solutions: { score: { name: "score", table: { _: { name: "solutions" } } } },
}));

const { scoreOrder } = await import("./problem-utils");
const { solutions } = await import("@/db/schema");

describe("scoreOrder", () => {
  it("minimize → asc", () => {
    expect(scoreOrder("minimize", solutions.score as any)).toEqual(asc(solutions.score as any));
  });

  it("maximize → desc", () => {
    expect(scoreOrder("maximize", solutions.score as any)).toEqual(desc(solutions.score as any));
  });

  it("unknown scoring defaults to desc", () => {
    expect(scoreOrder("unknown", solutions.score as any)).toEqual(desc(solutions.score as any));
  });
});
