import { z } from "zod";
import type { ProblemDef } from "./types";

const numOrStr = z.union([z.number(), z.string()]);

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
    vectors: "array of 594 vectors in R^11 (each a list of 11 float64 values or high-precision decimal strings with up to 80 significant digits)",
  },
  zodSchema: z.object({
    vectors: z.array(z.array(numOrStr).length(11)).length(594),
  }),
  verifier: `import itertools
import math
from decimal import Decimal, InvalidOperation, getcontext

getcontext().prec = 80

N = 594
D = 11
MAX_INTEGER_DIGITS = 80
ZERO = Decimal(0)
TWO = Decimal(2)
FOUR = Decimal(4)


def _to_dec(x):
    if isinstance(x, bool):
        raise ValueError("Coordinates must be numbers or decimal strings")
    if isinstance(x, int):
        return Decimal(x)
    if isinstance(x, float):
        if not math.isfinite(x):
            raise ValueError("Coordinates must be finite")
        return Decimal(repr(x))
    if isinstance(x, str):
        try:
            value = Decimal(x)
        except InvalidOperation:
            raise ValueError(f"Invalid decimal string: {x!r}")
        if not value.is_finite():
            raise ValueError("Coordinates must be finite")
        return value
    raise ValueError("Coordinates must be numbers or decimal strings")


# Exact certification uses Python integers only, so no rounding or underflow is possible.
# Coordinates beyond MAX_INTEGER_DIGITS are scored by the overlap loss instead.
def _integer_vectors(dec_vecs):
    int_vecs = []
    for vec in dec_vecs:
        row = []
        for x in vec:
            if x != x.to_integral_value():
                return None
            if x != ZERO and x.adjusted() >= MAX_INTEGER_DIGITS:
                return None
            row.append(int(x))
        int_vecs.append(row)
    return int_vecs


def _exact_check(int_vecs):
    squared_norms = [sum(x * x for x in vec) for vec in int_vecs]
    if min(squared_norms) == 0:
        return False
    max_sq_norm = max(squared_norms)
    for p, q in itertools.combinations(int_vecs, 2):
        if sum((a - b) * (a - b) for a, b in zip(p, q)) < max_sq_norm:
            return False
    return True


# Each vector is divided by its largest |coordinate| before any squaring, so the
# result is invariant to the vector's scale and the dominant terms cannot underflow.
def _overlap_loss(dec_vecs):
    scaled = []
    for vec in dec_vecs:
        largest = max(abs(x) for x in vec)
        if largest == ZERO:
            raise ValueError("All vectors must be non-zero")
        unit = [x / largest for x in vec]
        norm = sum((x * x for x in unit), ZERO).sqrt()
        scaled.append([(x * TWO) / norm for x in unit])

    total = ZERO
    for i in range(N):
        for j in range(i + 1, N):
            sq = sum(((scaled[i][k] - scaled[j][k]) ** 2 for k in range(D)), ZERO)
            if sq < FOUR:
                total += TWO - sq.sqrt()
    return float(total)


def evaluate(data: dict) -> float:
    vectors = data["vectors"]
    if len(vectors) != N or any(len(vec) != D for vec in vectors):
        raise ValueError(f"Expected {N} vectors of length {D}")
    dec_vecs = [[_to_dec(x) for x in vec] for vec in vectors]
    int_vecs = _integer_vectors(dec_vecs)
    if int_vecs is not None and _exact_check(int_vecs):
        return 0.0
    return _overlap_loss(dec_vecs)`,
};

export default problem;
