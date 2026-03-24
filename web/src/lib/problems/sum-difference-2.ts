import { z } from "zod";
import type { ProblemDef } from "./types";

const problem: ProblemDef = {
  slug: "sum-difference-2",
  title: "Sum-Difference Problem II (Lower Bound)",
  reference: "Problem 6.43 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-5,
  featured: true,
  description: `## Problem

Let $C$ be the least constant such that

$$|A - A| \\leq |A + A|^C$$

for any non-empty finite set $A$ of integers, where $A + A = \\{a + b : a, b \\in A\\}$ and $A - A = \\{a - b : a, b \\in A\\}$.

**Establish a lower bound for $C$ that is as strong as possible.**

## Scoring

Submit a list of distinct integers \`elements\`. The server computes:

$$S(A) = \\frac{\\log |A - A|}{\\log |A + A|}$$

Higher $S(A)$ is better — it proves $C \\geq S(A)$. All elements must be integers with $|x| \\leq 2 \\times 10^9$, and the list must have at least 2 distinct elements.`,
  solutionSchema: {
    elements: "list of distinct integers",
  },
  zodSchema: z.object({
    elements: z.array(z.number().int()).min(2).max(1_000_000),
  }),
  verifier: `import math

def evaluate(solution: dict) -> float:
    elements = solution["elements"]
    if not all(isinstance(x, int) for x in elements):
        raise ValueError("All elements must be integers.")
    if len(elements) < 2:
        raise ValueError("List must have at least 2 elements.")
    if any(abs(x) > 2_000_000_000 for x in elements):
        raise ValueError("Elements must be in [-2e9, 2e9].")
    s = list(set(elements))
    if len(s) < 2:
        raise ValueError("List must have at least 2 distinct elements.")
    a_minus_a = set()
    a_plus_a = set()
    for x in s:
        for y in s:
            a_minus_a.add(x - y)
            a_plus_a.add(x + y)
    lhs = len(a_minus_a)
    rhs = len(a_plus_a)
    if rhs <= 1:
        raise ValueError("|A+A| must be > 1.")
    return math.log(lhs) / math.log(rhs)`,
};

export default problem;
