import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "kissing-number-d11",
  title: "Kissing Number in Dimension 11 (n=594)",
  reference: "Problem 6.8 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 0,
  evaluationMode: "construction",
  featured: true,
  description: `## Problem

The kissing number problem asks: how many non-overlapping unit spheres can simultaneously touch a central unit sphere in $d$ dimensions?

For $d = 11$, the best known lower bound is **593** ([AlphaEvolve / Novikov et al., 2025](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/AlphaEvolve.pdf)), improving on the previous record of 592 ([Ganzhinov, 2022](https://arxiv.org/abs/2207.08266)).

**Your goal:** Find a configuration of **594** unit spheres that all touch a central unit sphere in 11 dimensions, with no overlaps. This would establish a new lower bound.

## Setup

Submit 594 non-zero vectors in $\\mathbb{R}^{11}$. Each vector $x_i$ defines a direction — the server normalizes it and places a unit sphere at $2x_i / \\|x_i\\|$ (distance 2 from the origin, i.e. touching the central unit sphere).

For each pair of sphere centers at distance $d < 2$, the spheres overlap. The penalty is:

$$\\text{loss} = \\sum_{i < j} \\max(0,\\; 2 - \\|c_i - c_j\\|)$$

where $c_i = 2x_i / \\|x_i\\|$.

## Scoring

Lower is better. Any score $> 0$ means some spheres still overlap.

A score of exactly **0** means a valid kissing configuration — proof that the kissing number in dimension 11 is at least 594. To achieve score 0, submit integer-valued vectors: the verifier will use exact integer arithmetic to confirm that $\\min_{i < j} \\|v_i - v_j\\|^2 \\geq \\max_i \\|v_i\\|^2$, which guarantees non-overlap without floating-point error.

Submit \`vectors\` — an array of 594 vectors in $\\mathbb{R}^{11}$, each a list of 11 numbers (floats or integers).

## Reference

Problem 6.8 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    vectors: "array of 594 vectors in R^11 (each a list of 11 floats)",
  },
  zodSchema: z.object({
    vectors: z.array(z.array(num).length(11)).length(594),
  }),
  verifier: `import itertools
from decimal import Decimal, getcontext

getcontext().prec = 80

ZERO = Decimal(0)
TWO = Decimal(2)
FOUR = Decimal(4)


def _to_dec(x):
    return Decimal(str(x))


def _exact_check(vectors):
    d = len(vectors[0])
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
    if len(vectors) != 594 or len(vectors[0]) != 11:
        raise ValueError(f"Expected shape (594, 11), got ({len(vectors)}, {len(vectors[0])})")
    if _exact_check(vectors):
        return 0.0
    return _overlap_loss(vectors)`,
};

export default problem;
