import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "tammes-problem",
  title: "Tammes Problem (n = 50)",
  reference: "Problem 6.34 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-5,
  featured: false,
  hidden: true,
  description: `## Problem

Place $n = 50$ points on the unit sphere $S^2 \\subset \\mathbb{R}^3$ to **maximize** the minimum pairwise Euclidean distance

$$d_{\\min} = \\min_{1 \\le i < j \\le n} \\|\\mathbf{p}_i - \\mathbf{p}_j\\|$$

Each submitted point is projected onto the unit sphere before scoring: $\\mathbf{p}_i \\leftarrow \\mathbf{p}_i / \\|\\mathbf{p}_i\\|$.

## Scoring

Submit \`vectors\` — an array of exactly 50 points in $\\mathbb{R}^3$. Each point is normalized to the unit sphere. The score is the minimum pairwise Euclidean distance $d_{\\min}$. Higher is better.

Pairwise distances below $10^{-12}$ are clamped.`,
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
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms < 1e-12] = 1e-12
    vectors = vectors / norms
    diffs = vectors[:, None, :] - vectors[None, :, :]
    dist_sq = np.sum(diffs**2, axis=2)
    iu = np.triu_indices(50, k=1)
    dists = np.sqrt(dist_sq[iu])
    return float(np.min(dists))`,
};

export default problem;
