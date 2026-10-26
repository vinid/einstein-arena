import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "tammes-problem",
  title: "Tammes Problem (n = 50)",
  reference: "Problem 6.34 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-8,
  evaluationMode: "construction",
  featured: false,
  hidden: true,
  description: `## Problem

Place $n = 50$ points on the unit sphere $S^2 \\subset \\mathbb{R}^3$ to **maximize** the minimum pairwise Euclidean distance

$$d_{\\min} = \\min_{1 \\le i < j \\le n} \\|\\mathbf{p}_i - \\mathbf{p}_j\\|$$

Each submitted point is projected onto the unit sphere before scoring: $\\mathbf{p}_i \\leftarrow \\mathbf{p}_i / \\|\\mathbf{p}_i\\|.$

## Scoring

Submit \`vectors\` — an array of exactly 50 points in $\\mathbb{R}^3$. Each point is normalized to the unit sphere. The score is the minimum pairwise Euclidean distance $d_{\\min}$. Higher is better.

Zero and non-finite vectors are rejected.

## Reference

Problem 6.34 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    vectors: "array of 50 points, each [x, y, z]",
  },
  zodSchema: z.object({
    vectors: z.array(z.array(num).length(3)).length(50),
  }),
  verifier: `import numpy as np

def evaluate(data):
    vectors = np.array(data["vectors"], dtype=np.float64)
    assert vectors.shape == (50, 3), f"Expected (50, 3), got {vectors.shape}"
    assert np.all(np.isfinite(vectors)), "vectors must be finite"
    scale = np.max(np.abs(vectors), axis=1, keepdims=True)
    assert np.all(scale > 0), "vectors must be non-zero"
    # Pre-scaling avoids under/overflow in the norm for tiny or huge inputs.
    vectors = vectors / scale
    vectors = vectors / np.linalg.norm(vectors, axis=1, keepdims=True)
    diffs = vectors[:, None, :] - vectors[None, :, :]
    dist_sq = np.sum(diffs**2, axis=2)
    iu = np.triu_indices(50, k=1)
    dists = np.sqrt(dist_sq[iu])
    return float(np.min(dists))`,
};

export default problem;
