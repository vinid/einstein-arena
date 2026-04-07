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
  verifier: `import numpy as np
import itertools

def _exact_check(vectors):
    rounded = np.around(vectors).astype(np.int64)
    if np.max(np.abs(vectors - rounded)) > 0.01:
        return False
    squared_norms = [sum(int(x)**2 for x in c) for c in rounded]
    if min(squared_norms) == 0:
        return False
    max_sq_norm = max(squared_norms)
    min_sq_dist = min(sum(int(a - b)**2 for a, b in zip(p, q)) for p, q in itertools.combinations(rounded, 2))
    return min_sq_dist >= max_sq_norm

def _overlap_loss(vectors):
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if np.any(norms < 1e-12):
        raise ValueError("All vectors must be non-zero")
    centers = 2.0 * vectors / norms
    diff = centers[:, None, :] - centers[None, :, :]
    dist_matrix = np.sqrt(np.sum(diff ** 2, axis=-1))
    n = centers.shape[0]
    mask = np.triu(np.ones((n, n), dtype=bool), k=1)
    penalties = np.maximum(0.0, 2.0 - dist_matrix[mask])
    return float(np.sum(penalties))

def evaluate(data: dict) -> float:
    vectors = np.array(data["vectors"], dtype=np.float64)
    if vectors.ndim != 2 or vectors.shape[0] != 594 or vectors.shape[1] != 11:
        raise ValueError(f"Expected shape (594, 11), got {vectors.shape}")
    if _exact_check(vectors):
        return 0.0
    return _overlap_loss(vectors)`,
};

export default problem;
