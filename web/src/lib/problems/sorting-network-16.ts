import { z } from "zod";
import type { ProblemDef } from "./types";

const comparator = z
  .tuple([
    z.number().int().min(0).max(15),
    z.number().int().min(0).max(15),
  ])
  .refine(([i, j]) => i < j, "Each comparator must satisfy i < j");

const problem: ProblemDef = {
  slug: "sorting-network-16",
  title: "Sorting Network (16 inputs)",
  reference: "https://bertdobbelaere.github.io/sorting_networks.html",
  scoring: "minimize",
  minImprovement: 1,
  evaluationMode: "construction",
  featured: false,
  hidden: false,
  description: `> **Under active review:** This problem is being reviewed for verifier robustness and potential exploits. Scores and leaderboard standings may change.

## Problem

A sorting network on 16 wires is a fixed sequence of comparators. A comparator $(i,j)$, where $0 \\le i < j \\le 15$, swaps the values on wires $i$ and $j$ when they are out of order.

**Minimize the number of comparators** in a network that sorts every possible input.

The smallest known network has **60 comparators**, discovered by M. W. Green in 1969. The current proven lower bound is **57 comparators**, based on Van Voorhis-style lower-bound arguments. Therefore,

$$57 \\le S(16) \\le 60.$$

A valid network with 59 or fewer comparators establishes a new world-record upper bound. A valid 57-comparator network would settle the exact value of $S(16)$.

**This challenge is highly speculative.** The 60-comparator record has survived extensive human and computational searches since 1969, and it may be optimal, although no proof currently rules out networks of size 57, 58, or 59.

## Verification

By the zero-one principle, a comparator network sorts arbitrary comparable values if and only if it sorts every binary input. The verifier therefore evaluates the submitted network on all $2^{16}=65{,}536$ binary strings using exact integer operations.

Submissions contain between 1 and 60 comparators. Every comparator must be an integer pair $(i,j)$ satisfying $0 \\le i < j \\le 15$. A submission scores its number of comparators only if all 65,536 inputs are sorted; otherwise it is rejected.

No baseline network is seeded.

## Reference

Green's 60-comparator network and the current size and depth bounds are listed in the [sorting-network catalog](https://bertdobbelaere.github.io/sorting_networks.html).`,
  solutionSchema: {
    comparators: "list of 1 to 60 integer pairs [i, j], where 0 <= i < j <= 15",
  },
  zodSchema: z.object({
    comparators: z.array(comparator).min(1).max(60),
  }),
  verifier: `import numpy as np

N = 16
MAX_COMPARATORS = 60


def evaluate(data):
    comparators = data["comparators"]
    if not isinstance(comparators, list) or not 1 <= len(comparators) <= MAX_COMPARATORS:
        raise ValueError("Expected between 1 and 60 comparators")

    checked = []
    for comparator in comparators:
        if not isinstance(comparator, list) or len(comparator) != 2:
            raise ValueError("Each comparator must be a pair [i, j]")
        i, j = comparator
        if isinstance(i, bool) or isinstance(j, bool) or not isinstance(i, int) or not isinstance(j, int):
            raise ValueError("Comparator indices must be integers")
        if not 0 <= i < j < N:
            raise ValueError("Each comparator must satisfy 0 <= i < j <= 15")
        checked.append((i, j))

    values = (
        (
            np.arange(1 << N, dtype=np.uint32)[:, None]
            >> np.arange(N, dtype=np.uint32)
        )
        & 1
    ).astype(np.uint8)

    for i, j in checked:
        left = values[:, i].copy()
        right = values[:, j].copy()
        values[:, i] = np.minimum(left, right)
        values[:, j] = np.maximum(left, right)

    if np.any(values[:, :-1] > values[:, 1:]):
        return float("inf")

    return float(len(checked))`,
};

export default problem;
