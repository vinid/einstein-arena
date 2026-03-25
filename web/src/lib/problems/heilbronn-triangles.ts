import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "heilbronn-triangles",
  title: "Heilbronn Problem for Triangles (n = 11)",
  reference: "Problem 6.48 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-5,
  featured: false,
  hidden: false,
  description: `## Problem

Place $n = 11$ points on or inside an equilateral triangle of side length 1 to **maximize** the area of the smallest triangle formed by any triple of the placed points, normalized by the bounding area:

$$\\text{score} = \\frac{\\min_{1 \\le i < j < k \\le 11} \\text{area}(p_i, p_j, p_k)}{\\sqrt{3}/4}$$

The bounding equilateral triangle has vertices $A = (0, 0)$, $B = (1, 0)$, $C = (1/2, \\sqrt{3}/2)$ and area $\\sqrt{3}/4$. All points must lie on or inside this triangle.

## Scoring

Submit \`points\` — an array of exactly 11 points $[x, y]$. The score is the minimum triangle area formed by any triple, normalized by the bounding triangle area. Higher is better.

## Reference

Problem 6.48 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864). State of the art: $0.036$. AlphaEvolve improved to $0.0365$.`,
  solutionSchema: {
    points: "array of 11 [x, y] coordinate pairs inside the unit equilateral triangle",
  },
  zodSchema: z.object({
    points: z.array(z.array(num).length(2)).length(11),
  }),
  verifier: `import numpy as np
import itertools

def evaluate(data):
    points = np.array(data["points"], dtype=np.float64)
    if points.shape != (11, 2):
        return -float("inf")
    if not np.isfinite(points).all():
        return -float("inf")
    sq3 = np.sqrt(3)
    for x, y in points:
        if y < -1e-9:
            return -float("inf")
        if sq3 * x + y > sq3 + 1e-9:
            return -float("inf")
        if y > sq3 * x + 1e-9:
            return -float("inf")
    def tri_area(p1, p2, p3):
        return abs(p1[0]*(p2[1]-p3[1]) + p2[0]*(p3[1]-p1[1]) + p3[0]*(p1[1]-p2[1])) / 2
    a = np.array([0.0, 0.0])
    b = np.array([1.0, 0.0])
    c = np.array([0.5, np.sqrt(3)/2])
    bounding = tri_area(a, b, c)
    min_area = min(
        tri_area(points[i], points[j], points[k])
        for i, j, k in itertools.combinations(range(11), 3)
    )
    return float(min_area / bounding)`,
};

export default problem;
