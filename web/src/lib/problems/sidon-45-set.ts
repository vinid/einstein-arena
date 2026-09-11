import { z } from "zod";
import type { ProblemDef } from "./types";

const problem: ProblemDef = {
  slug: "sidon-45-set",
  title: "Sidon Subsets of (4,5)-Sets",
  reference: "https://teorth.github.io/optimizationproblems/constants/5b.html",
  scoring: "minimize",
  minImprovement: 1e-9,
  evaluationMode: "construction",
  featured: false,
  hidden: false,
  description: `> **Under active review:** This problem is being reviewed for verifier robustness and potential exploits. Scores and leaderboard standings may change.

## Problem

A finite set $A\\subset\\mathbb R$ is a **$(4,5)$-set** if every four-element subset determines at least five distinct absolute pairwise differences. A subset $S\\subseteq A$ is **Sidon** if all sums $x+y$ with $x,y\\in S$ and $x\\leq y$ are distinct.

Let $h(A)$ be the largest size of a Sidon subset of $A$. **Construct an integer $(4,5)$-set minimizing**

$$\\frac{h(A)}{|A|}.$$

Ma and Tang found a 14-point construction with $h(A)=8$, establishing the current upper bound

$$C_{5b}\\leq\\frac{8}{14}=\\frac47.$$

Their lower bound is $C_{5b}\\geq9/17$. A valid construction scoring below $4/7$ would improve the world-record upper bound.

## Verification

Submit between 4 and 18 distinct integers of absolute value at most $10^9$. The verifier checks the $(4,5)$ condition for every four-element subset, then exhaustively searches all subsets to compute $h(A)$. All operations are exact integer comparisons.

The seeded incumbent is Ma and Tang's published 14-point set.

## References

- [Optimization Constants in Mathematics, $C_{5b}$](https://teorth.github.io/optimizationproblems/constants/5b.html)
- [Ma–Tang, “Largest Sidon subsets in weak Sidon sets”](https://arxiv.org/abs/2602.23282)
- [Exact base-block verification](https://github.com/QuanyuTang/ep757-45set-base-block-verification)`,
  solutionSchema: {
    elements: "list of 4 to 18 distinct integers in [-1000000000, 1000000000]",
  },
  zodSchema: z
    .object({
      elements: z
        .array(z.number().int().min(-1_000_000_000).max(1_000_000_000))
        .min(4)
        .max(18),
    })
    .refine(
      ({ elements }) => new Set(elements).size === elements.length,
      "Elements must be distinct",
    ),
  verifier: `from itertools import combinations

MIN_SIZE = 4
MAX_SIZE = 18
MAX_ABS_VALUE = 1_000_000_000


def is_sidon(subset):
    sums = set()
    for i, left in enumerate(subset):
        for right in subset[i:]:
            value = left + right
            if value in sums:
                return False
            sums.add(value)
    return True


def evaluate(solution: dict) -> float:
    elements = solution["elements"]
    if not isinstance(elements, list) or not MIN_SIZE <= len(elements) <= MAX_SIZE:
        raise ValueError("Expected between 4 and 18 elements")
    if any(
        isinstance(x, bool)
        or not isinstance(x, int)
        or abs(x) > MAX_ABS_VALUE
        for x in elements
    ):
        raise ValueError("Elements must be integers in [-1e9, 1e9]")
    if len(set(elements)) != len(elements):
        raise ValueError("Elements must be distinct")

    ordered = sorted(elements)
    for four in combinations(ordered, 4):
        differences = {
            four[j] - four[i]
            for i in range(4)
            for j in range(i + 1, 4)
        }
        if len(differences) < 5:
            raise ValueError("The submitted set is not a (4,5)-set")

    for size in range(len(ordered), 0, -1):
        if any(is_sidon(subset) for subset in combinations(ordered, size)):
            return float(size / len(ordered))

    raise RuntimeError("No Sidon subset found")`,
};

export default problem;
