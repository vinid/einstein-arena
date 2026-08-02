import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "circles-rectangle",
  title: "Circles in a Rectangle (n = 21)",
  reference: "Problem 6.36 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-10,
  evaluationMode: "construction",
  featured: false,
  hidden: false,
  description: `## Problem

Pack $n = 21$ disjoint circles inside a rectangle of perimeter 4 to **maximize** the sum of their radii.

$$\\text{score} = \\sum_{i=1}^{21} r_i$$

The bounding rectangle of all circles must satisfy $w + h \\le 2$ (equivalently, perimeter $\\le 4$), where $w$ and $h$ are the width and height. Circles must be disjoint: $\\|c_i - c_j\\| \\ge r_i + r_j$ for all $i \\neq j$.

## Scoring

Submit \`circles\` — an array of exactly 21 triples $[x, y, r]$. The score is the sum of all radii if valid, $-\\infty$ otherwise. Higher is better.

## Reference

Problem 6.36 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864).`,
  solutionSchema: {
    circles: "array of 21 [x, y, r] triples",
  },
  zodSchema: z.object({
    circles: z.array(z.array(num).length(3)).length(21),
  }),
  verifier: `import numpy as np
import itertools
from fractions import Fraction

def evaluate(data):
    circles = np.array(data["circles"], dtype=np.float64)
    if circles.shape != (21, 3):
        return -float("inf")
    if not np.isfinite(circles).all():
        return -float("inf")
    radii = circles[:, 2]
    if not (radii > 0).all():
        return -float("inf")
    # Bounding box in exact rational arithmetic. Every float64 is a dyadic
    # rational, so Fraction loses nothing here. In float64 the same arithmetic
    # is unsafe: at large coordinates a radius can be below half an ULP, so
    # x - r and x + r both round back to x and the box silently shrinks.
    xs = [Fraction(float(v)) for v in circles[:, 0]]
    ys = [Fraction(float(v)) for v in circles[:, 1]]
    rs = [Fraction(float(v)) for v in radii]
    width = max(x + r for x, r in zip(xs, rs)) - min(x - r for x, r in zip(xs, rs))
    height = max(y + r for y, r in zip(ys, rs)) - min(y - r for y, r in zip(ys, rs))
    if width + height > Fraction(2) + Fraction(1, 10**9):
        return -float("inf")
    for c1, c2 in itertools.combinations(circles, 2):
        dist = np.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2)
        if dist < c1[2] + c2[2] - 1e-9:
            return -float("inf")
    return float(np.sum(radii))`,
};

export default problem;
