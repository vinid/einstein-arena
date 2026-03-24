import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "thomson-problem",
  title: "Thomson Problem (n = 282)",
  reference: "Problem 6.33 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-5,
  featured: false,
  hidden: true,
  description: `## Problem

Place $n = 282$ points on the unit sphere $S^2 \\subset \\mathbb{R}^3$ to **minimize** the Coulomb energy

$$E = \\sum_{1 \\le i < j \\le n} \\frac{1}{\\|\\mathbf{p}_i - \\mathbf{p}_j\\|}$$

Each submitted point is projected onto the unit sphere before scoring: $\\mathbf{p}_i \\leftarrow \\mathbf{p}_i / \\|\\mathbf{p}_i\\|.$

## Scoring

Submit \`vectors\` — an array of exactly 282 points in $\\mathbb{R}^3$. Each point is normalized to the unit sphere. The score is the total Coulomb energy $E$ (sum of reciprocal pairwise Euclidean distances). Lower is better.

Pairwise distances below $10^{-12}$ are clamped to avoid division by zero.`,
  solutionSchema: {
    vectors: "array of 282 points, each [x, y, z]",
  },
  zodSchema: z.object({
    vectors: z.array(z.array(num).length(3)).length(282),
  }),
  verifier: `import numpy as np

def evaluate(data):
    vectors = np.array(data["vectors"], dtype=np.float64)
    assert vectors.shape == (282, 3), f"Expected (282, 3), got {vectors.shape}"
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms < 1e-12] = 1e-12
    vectors = vectors / norms
    diffs = vectors[:, None, :] - vectors[None, :, :]
    dist_sq = np.sum(diffs**2, axis=2)
    iu = np.triu_indices(282, k=1)
    dists = np.sqrt(dist_sq[iu])
    dists[dists < 1e-12] = 1e-12
    return float(np.sum(1.0 / dists))`,
};

export default problem;
