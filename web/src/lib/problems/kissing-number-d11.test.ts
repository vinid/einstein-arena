import { describe, expect, it } from "vitest";
import { evaluateLocally } from "../local-evaluate";
import kissingNumberD11 from "./kissing-number-d11";

const { verifier } = kissingNumberD11;

function randomVectors(seed: number) {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31 - 0.5;
  };
  return Array.from({ length: 594 }, () => Array.from({ length: 11 }, next));
}

const exactCheck = (vectors: number[][]) =>
  evaluateLocally(
    `${verifier}\n\ndef evaluate(data):\n    return float(_exact_check(_integer_vectors([[_to_dec(x) for x in v] for v in data["vectors"]])))`,
    { vectors },
  );

// The D11 root system: every vector with two non-zero entries, each +1 or -1.
function d11Roots() {
  const roots: number[][] = [];
  for (let i = 0; i < 11; i++) {
    for (let j = i + 1; j < 11; j++) {
      for (const a of [1, -1]) {
        for (const b of [1, -1]) {
          const v = Array(11).fill(0);
          v[i] = a;
          v[j] = b;
          roots.push(v);
        }
      }
    }
  }
  return roots;
}

describe("kissing-number-d11 verifier", () => {
  it("does not score Decimal-underflow vectors as zero", async () => {
    const bitPattern = Array.from({ length: 594 }, (_, index) => [
      "1e-500039",
      ...Array.from({ length: 10 }, (_, bit) =>
        (index >> bit) & 1 ? "6e-500040" : "-6e-500040",
      ),
    ]);
    const uniform = Array.from({ length: 594 }, (_, index) => [
      "1.22e-500039",
      ...Array.from({ length: 10 }, (_, bit) =>
        (index >> bit) & 1 ? "1.22e-500039" : "-1.22e-500039",
      ),
    ]);

    expect(await evaluateLocally(verifier, { vectors: bitPattern })).toBeGreaterThan(1);
    expect(await evaluateLocally(verifier, { vectors: uniform })).toBeGreaterThan(1);
  });

  it("is invariant to vector scale", async () => {
    const vectors = randomVectors(7);
    const tiny = vectors.map((v) => v.map((x) => `${x}e-500000`));
    const huge = vectors.map((v) => v.map((x) => `${x}e500000`));

    const base = await evaluateLocally(verifier, { vectors });
    expect(base).toBeGreaterThan(100);
    expect(await evaluateLocally(verifier, { vectors: tiny })).toBeCloseTo(base, 9);
    expect(await evaluateLocally(verifier, { vectors: huge })).toBeCloseTo(base, 9);
  });

  it("certifies separated integer configurations exactly", async () => {
    const roots = d11Roots();
    expect(await exactCheck(roots)).toBe(1);

    const crowded = [...roots, [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]];
    expect(await exactCheck(crowded)).toBe(0);
  });

  it("scores integers beyond 80 digits without exact certification", async () => {
    const roots = d11Roots();
    const vectors = Array.from({ length: 594 }, (_, i) =>
      roots[i % roots.length].map((x) => (x === 0 ? "0" : `${x}${"0".repeat(80)}`)),
    );
    expect(await exactCheck(roots)).toBe(1);
    expect(await evaluateLocally(verifier, { vectors })).toBeGreaterThan(1);
  });

  it("rejects zero vectors and non-finite strings", async () => {
    const zero = randomVectors(3);
    zero[5] = Array(11).fill(0);
    await expect(evaluateLocally(verifier, { vectors: zero })).rejects.toThrow(/non-zero/);

    const notFinite: unknown[][] = randomVectors(4);
    notFinite[0][0] = "Infinity";
    await expect(evaluateLocally(verifier, { vectors: notFinite })).rejects.toThrow(/finite/);
  });
});
