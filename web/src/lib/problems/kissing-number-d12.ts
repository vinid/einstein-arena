import { z } from "zod";
import type { ProblemDef } from "./types";

const numOrStr = z.union([z.number(), z.string()]);

const problem: ProblemDef = {
  slug: "kissing-number-d12",
  title: "Kissing Number in Dimension 12 (n=841)",
  reference: "https://cohn.mit.edu/kissing-numbers/",
  scoring: "minimize",
  minImprovement: 0,
  evaluationMode: "construction",
  featured: true,
  description: `## Status: Solved Outside EinsteinArena

This challenge is now archived. The target lower bound **K(12) ≥ 841** was solved outside EinsteinArena.

- **Paper:** Takhanov et al., [A Kissing Configuration in 12 Dimensions with 841 Spheres](https://arxiv.org/pdf/2606.18984)
- **Origin:** The solution appeared on the authors' GitHub on June 17th, 2026.
- **Status:** Submissions are closed for this problem.
- **Original EinsteinArena target:** Find 841 non-overlapping kissing spheres in 12 dimensions.

## Problem

The kissing number problem asks: how many non-overlapping unit spheres can simultaneously touch a central unit sphere in $d$ dimensions?

For $d = 12$, the best known lower bound was **840**, achieved by the Coxeter-Todd lattice $K_{12}$ ([Leech and Sloane, 1971](https://doi.org/10.4153/CJM-1971-081-3)). The best known upper bound is **1355** ([de Laat and Leijenhorst, 2024](https://doi.org/10.1007/s12532-024-00264-w)).

**Original goal:** Find a configuration of **841** unit spheres that all touch a central unit sphere in 12 dimensions, with no overlaps. This would establish a new world record lower bound for the kissing number in dimension 12.

## Setup

Submit 841 non-zero vectors in $\\mathbb{R}^{12}$. Each vector $x_i$ defines a direction — the server normalizes it and places a unit sphere at $2x_i / \\|x_i\\|$ (distance 2 from the origin, i.e. touching the central unit sphere).

For each pair of sphere centers, the overlap penalty is:

$$\\text{loss} = \\sum_{i < j} \\max(0,\\; 2 - \\|c_i - c_j\\|)$$

where $c_i = 2x_i / \\|x_i\\|$.

## Scoring

Lower is better. Any score $> 0$ means some spheres still overlap.

A score of exactly **0** means a valid kissing configuration — proof that the kissing number in dimension 12 is at least 841. To achieve score 0, submit integer-valued vectors: the verifier will use exact integer arithmetic to confirm that $\\min_{i < j} \\|v_i - v_j\\|^2 \\geq \\max_i \\|v_i\\|^2$, which guarantees non-overlap without floating-point error.

Submit \`vectors\` — an array of 841 vectors in $\\mathbb{R}^{12}$, each a list of 12 numbers (integers or floats).

## Reference

[Kissing numbers table](https://cohn.mit.edu/kissing-numbers/) by Henry Cohn (MIT). Lower bound reference: Leech and Sloane (1971), Coxeter-Todd lattice $K_{12}$.`,
  solutionSchema: {
    vectors: "array of 841 vectors in R^12 (each a list of 12 numbers)",
  },
  zodSchema: z.object({
    vectors: z.array(z.array(numOrStr).length(12)).length(841),
  }),
  verifier: `import itertools
from decimal import Decimal, getcontext

getcontext().prec = 30

ZERO = Decimal(0)
TWO = Decimal(2)
FOUR = Decimal(4)


def _to_dec(x):
    return Decimal(str(x))


def _exact_check(vectors):
    dec_vecs = [[_to_dec(x) for x in vec] for vec in vectors]

    squared_norms = [sum(x * x for x in vec) for vec in dec_vecs]
    if min(squared_norms) == ZERO:
        return False
    max_sq_norm = max(squared_norms)

    min_sq_dist = None
    for p, q in itertools.combinations(dec_vecs, 2):
        sq_dist = sum((a - b) ** 2 for a, b in zip(p, q))
        if min_sq_dist is None or sq_dist < min_sq_dist:
            min_sq_dist = sq_dist

    return min_sq_dist >= max_sq_norm


def _overlap_loss(vectors):
    d = len(vectors[0])
    scaled = []
    for vec in vectors:
        norm_sq = sum((_to_dec(x) ** 2 for x in vec), ZERO)
        if norm_sq == ZERO:
            raise ValueError("All vectors must be non-zero")
        norm = norm_sq.sqrt()
        scaled.append([(_to_dec(x) * TWO) / norm for x in vec])

    n = len(scaled)
    total = ZERO
    for i in range(n):
        for j in range(i + 1, n):
            sq = sum(((scaled[i][k] - scaled[j][k]) ** 2 for k in range(d)), ZERO)
            if sq < FOUR:
                total += (TWO - sq.sqrt())
    return float(total)


def evaluate(data: dict) -> float:
    vectors = data["vectors"]
    n, d = 841, 12

    if len(vectors) != n:
        raise ValueError(f"Expected {n} vectors, got {len(vectors)}")
    for v in vectors:
        if len(v) != d:
            raise ValueError(f"Each vector must have {d} components, got {len(v)}")

    if _exact_check(vectors):
        return 0.0
    return _overlap_loss(vectors)`,
};

export default problem;
