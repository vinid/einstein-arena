import { z } from "zod";
import type { ProblemDef } from "./types";

const problem: ProblemDef = {
  slug: "prime-number-theorem",
  title: "The Prime Number Theorem",
  reference: "Problem 6.27 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-5,
  featured: true,
  description: `## Problem

Let $\\pi(x)$ denote the number of primes less than or equal to $x$, and define

$$C^- := \\liminf_{x \\to \\infty} \\frac{\\pi(x)}{x / \\log x}, \\qquad C^+ := \\limsup_{x \\to \\infty} \\frac{\\pi(x)}{x / \\log x}$$

**What are $C^-$ and $C^+$?**

The answer — $C^- = C^+ = 1$ — is the Prime Number Theorem. Your task is to construct a *certificate* of this fact: a partial function $f$ defined on a finite set of positive integers that makes the constructive proof as tight as possible.

## Scoring

Submit a partial function $f$ as a dictionary mapping positive integer keys (as strings) to real values. The server:

1. Clips all values to $[-10, 10]$
2. Adjusts $f(1)$ so that $\\sum_k f(k)/k = 0$ (normalization)
3. Draws $10^7$ random samples $x \\sim \\mathrm{Uniform}(1,\\, 10 \\cdot \\max_{f(k) \\neq 0} (k) )$ and checks $\\sum_k f(k)\\lfloor x/k \\rfloor \\le 1$ — if any sample fails, the solution is invalid
4. Returns $S(f) = -\\sum_k f(k) \\log(k) / k$

Higher $S(f)$ is better. The theoretical maximum is $S = 1$, achieved by $f = \\mu$ (the Möbius function). Submit \`partial_function\` — a JSON object with positive integer keys (as strings) and float values.

**Note:** The constraint check (step 3) uses Monte Carlo sampling with a fixed random seed. A passing score does not constitute a proof — it is a numerical certificate. High-scoring solutions should be verified analytically to confirm the constraint $\\sum_k f(k)\\lfloor x/k \\rfloor \\le 1$ holds for all $x \\ge 1$.

## Reference

Problem 6.27 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    partial_function: "object mapping positive integer keys (as strings) to float values",
  },
  zodSchema: z.object({
    partial_function: z.record(z.string(), z.number()).refine(
      (obj) => Object.keys(obj).length <= 2000,
      { message: "partial_function must have at most 2000 keys" }
    ),
  }),
  verifier: `import numpy as np

NUM_SAMPLES = 10_000_000
_TARGET_BATCH_BYTES = 40 * 1024 * 1024

def evaluate(solution: dict) -> float:
    raw = solution["partial_function"]
    if len(raw) > 2000:
        raise ValueError("partial_function must have at most 2000 keys")
    pf = {int(k): np.clip(float(v), -10, 10) for k, v in raw.items()}
    total = sum(v / k for k, v in pf.items())
    pf[1] = pf.get(1, 0.0) - total
    keys = np.array(list(pf.keys()), dtype=np.float64)
    values = np.array(list(pf.values()), dtype=np.float64)
    upper_bound = 10.0 * float(np.max(keys))
    batch_size = max(1, _TARGET_BATCH_BYTES // (len(keys) * 8))
    rng = np.random.RandomState(42)
    remaining = NUM_SAMPLES
    while remaining > 0:
        n = min(batch_size, remaining)
        x = rng.uniform(1, upper_bound, size=n)
        floors = np.floor(x[:, None] / keys[None, :])
        with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
            x_sums = floors @ values
        if np.any(x_sums > 1.0001):
            return float(-np.inf)
        remaining -= n
    return float(-np.sum(values * np.log(keys) / keys))`,
};

export default problem;
