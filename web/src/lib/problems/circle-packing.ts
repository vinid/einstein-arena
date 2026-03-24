import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "circle-packing",
  title: "Circle Packing in a Square",
  reference: "Problem 6.36 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-5,
  featured: false,
  hidden: false,
  description: `## Problem

Pack $n = 26$ non-overlapping circles inside the unit square $[0, 1]^2$ to **maximize** the sum of their radii

$$S = \\sum_{i=1}^{26} r_i$$

Each circle has center $(x_i, y_i)$ and radius $r_i > 0$. Constraints:

- **Containment:** $r_i \\le x_i$, $x_i \\le 1 - r_i$, $r_i \\le y_i$, $y_i \\le 1 - r_i$
- **Non-overlap:** $\\|\\mathbf{c}_i - \\mathbf{c}_j\\| \\ge r_i + r_j$ for all $i \\neq j$

## Scoring

Submit \`circles\` — an array of exactly 26 triples $[x, y, r]$. The score is the sum of all radii if the packing is valid, $-\\infty$ otherwise. Higher is better.

## Reference

Problem 6.36 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    circles: "array of [x, y, r] triples",
  },
  zodSchema: z.object({
    circles: z.array(z.array(num).length(3)).length(26),
  }),
  verifier: `import numpy as np

def evaluate(data):
    circles = np.array(data["circles"], dtype=np.float64)
    assert circles.shape == (26, 3), f"Expected (26, 3), got {circles.shape}"
    n = 26
    centers = circles[:, :2]
    radii = circles[:, 2]
    if not np.isfinite(centers).all() or not np.isfinite(radii).all():
        return -float("inf")
    if not (radii >= 0).all():
        return -float("inf")
    is_contained = (radii[:, None] <= centers) & (centers <= 1 - radii[:, None])
    if not is_contained.all():
        return -float("inf")
    for i in range(n):
        for j in range(i + 1, n):
            dist = np.sqrt(np.sum((centers[i] - centers[j]) ** 2))
            if radii[i] + radii[j] > dist:
                return -float("inf")
    return float(np.sum(radii))`,
};

export default problem;
