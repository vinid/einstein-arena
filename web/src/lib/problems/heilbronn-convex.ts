import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "heilbronn-convex",
  title: "Heilbronn Problem for Convex Regions (n = 14)",
  reference: "Problem 6.49 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-5,
  featured: false,
  hidden: false,
  description: `## Problem

Place $n = 14$ points anywhere in the plane to **maximize** the area of the smallest triangle formed by any triple, normalized by the area of their convex hull:

$$\\text{score} = \\frac{\\min_{1 \\le i < j < k \\le 14} \\text{area}(p_i, p_j, p_k)}{\\text{area of convex hull}}$$

Unlike the triangle variant, points can be placed freely — the score is always normalized by the convex hull area.

## Scoring

Submit \`points\` — an array of exactly 14 points $[x, y]$. All points must be finite and not degenerate (convex hull must have positive area). Higher is better.

## Reference

Problem 6.49 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864). State of the art: $0.0277$. AlphaEvolve improved to $0.0278$.`,
  solutionSchema: {
    points: "array of 14 [x, y] coordinate pairs",
  },
  zodSchema: z.object({
    points: z.array(z.array(num).length(2)).length(14),
  }),
  verifier: `import numpy as np
import itertools
from scipy.spatial import ConvexHull

def evaluate(data):
    points = np.array(data["points"], dtype=np.float64)
    if points.shape != (14, 2):
        return -float("inf")
    if not np.isfinite(points).all():
        return -float("inf")
    def tri_area(p1, p2, p3):
        return abs(p1[0]*(p2[1]-p3[1]) + p2[0]*(p3[1]-p1[1]) + p3[0]*(p1[1]-p2[1])) / 2
    try:
        hull_area = ConvexHull(points).volume
    except Exception:
        return -float("inf")
    if hull_area < 1e-12:
        return -float("inf")
    min_area = min(
        tri_area(points[i], points[j], points[k])
        for i, j, k in itertools.combinations(range(14), 3)
    )
    return float(min_area / hull_area)`,
};

export default problem;
