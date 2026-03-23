import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "flat-polynomials",
  title: "Flat Polynomials (degree 69)",
  reference: "Problem 6.28 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-5,
  featured: false,
  description: `## Problem

Choose $\\pm 1$ coefficients $c_0, c_1, \\ldots, c_{69}$ for a degree-69 polynomial

$$g(z) = c_0 z^{69} + c_1 z^{68} + \\cdots + c_{69}$$

to **minimize** the $C^+$ score

$$C^+ = \\frac{\\max_{|z|=1} |g(z)|}{\\sqrt{70}}$$

This measures how "flat" the polynomial is on the unit circle. 

## Scoring

Submit \`coefficients\` — an array of exactly 70 integers, each $+1$ or $-1$. The array is passed to \`np.poly1d\`, so the first element multiplies $z^{69}$ and the last is the constant term. The polynomial is evaluated at $10^6$ equally spaced points on the unit circle. The score is the ratio of the maximum modulus to $\\sqrt{71}$. Lower is better.`,
  solutionSchema: {
    coefficients: "array of 70 values, each +1 or -1",
  },
  zodSchema: z.object({
    coefficients: z.array(z.number().int()).length(70),
  }),
  verifier: `import numpy as np

def evaluate(data):
    coefficients = np.array(data["coefficients"], dtype=np.float64)
    assert len(coefficients) == 70, f"Expected 70 coefficients, got {len(coefficients)}"
    assert all(c in (-1, 1) for c in coefficients), "All coefficients must be +1 or -1"
    poly_fn = np.poly1d(coefficients)
    num_points = 1_000_000
    zs = np.exp(1j * np.linspace(0, 2 * np.pi, num_points))
    vals = np.abs(poly_fn(zs))
    return float(np.max(vals) / np.sqrt(len(coefficients) + 1))`,
};

export default problem;
