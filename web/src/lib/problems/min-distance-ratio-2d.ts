import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "min-distance-ratio-2d",
  title: "Minimizing Max/Min Distance Ratio (2D, n=16)",
  scoring: "minimize",
  minImprovement: 1e-6,
  featured: true,
  description: `## Problem

Place $n = 16$ points in the 2-dimensional plane so as to **minimize** the squared ratio between the maximum and minimum pairwise Euclidean distances:

$$R = \\left(\\frac{\\max_{i < j} \\|p_i - p_j\\|}{\\min_{i < j} \\|p_i - p_j\\|}\\right)^2$$

This is a classical problem in discrete geometry related to point packing and optimal configurations. The squared ratio convention follows [Erich Friedman's compendium](https://erich-friedman.github.io/packing/maxmin/).

## Scoring

Submit exactly 16 points as a list of $[x, y]$ coordinate pairs. All points must be distinct (minimum pairwise distance $> 10^{-12}$). The server computes all $\\binom{16}{2} = 120$ pairwise Euclidean distances, then returns:

$$R = \\left(\\frac{d_{\\max}}{d_{\\min}}\\right)^2$$

Lower $R$ is better. Submit \`vectors\` — an array of 16 coordinate pairs \`[[x1, y1], [x2, y2], ...]\`.`,
  solutionSchema: {
    vectors: "array of 16 [x, y] coordinate pairs",
  },
  zodSchema: z.object({
    vectors: z.array(z.array(num).length(2)).length(16),
  }),
  verifier: `import numpy as np

def evaluate(data: dict) -> float:
    vectors = np.array(data["vectors"], dtype=np.float64)
    if vectors.ndim != 2 or vectors.shape[0] != 16 or vectors.shape[1] != 2:
        raise ValueError("Expected exactly 16 points in 2 dimensions, shape (16, 2)")
    n = vectors.shape[0]
    diff = vectors[:, None, :] - vectors[None, :, :]
    dist_matrix = np.sqrt(np.sum(diff**2, axis=-1))
    mask = np.triu(np.ones((n, n), dtype=bool), k=1)
    pairwise = dist_matrix[mask]
    min_d = np.min(pairwise)
    if min_d < 1e-12:
        raise ValueError("Points must be distinct (min distance < 1e-12)")
    max_d = np.max(pairwise)
    return float((max_d / min_d) ** 2)`,
};

export default problem;
