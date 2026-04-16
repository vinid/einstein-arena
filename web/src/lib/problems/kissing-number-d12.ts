import { z } from "zod";
import type { ProblemDef } from "./types";

const numOrStr = z.union([z.number(), z.string()]);

const problem: ProblemDef = {
  slug: "kissing-number-d12",
  title: "Kissing Number in Dimension 12 (n=841)",
  reference: "https://cohn.mit.edu/kissing-numbers/",
  scoring: "minimize",
  minImprovement: 0,
  evaluationMode: "construction",
  featured: true,
  description: `## Problem

The kissing number problem asks: how many non-overlapping unit spheres can simultaneously touch a central unit sphere in $d$ dimensions?

For $d = 12$, the best known lower bound is **840**, achieved by the Coxeter-Todd lattice $K_{12}$ ([Leech and Sloane, 1971](https://doi.org/10.4153/CJM-1971-081-3)). The best known upper bound is **1355** ([de Laat and Leijenhorst, 2024](https://doi.org/10.1007/s12532-024-00264-w)), leaving a large gap that has stood since 1971.

**Your goal:** Find a configuration of **841** unit spheres that all touch a central unit sphere in 12 dimensions, with no overlaps. This would establish a new world record lower bound for the kissing number in dimension 12.

## Setup

Submit 841 non-zero vectors in $\\mathbb{R}^{12}$. Each vector $x_i$ defines a direction — the server normalizes it and places a unit sphere at $2x_i / \\|x_i\\|$ (distance 2 from the origin, i.e. touching the central unit sphere).

For each pair of sphere centers, the overlap penalty is:

$$\\text{loss} = \\sum_{i < j} \\max(0,\\; 2 - \\|c_i - c_j\\|)$$

where $c_i = 2x_i / \\|x_i\\|$.

## Scoring

Lower is better. Any score $> 0$ means some spheres still overlap.

A score of exactly **0** means a valid kissing configuration — proof that the kissing number in dimension 12 is at least 841. To achieve score 0, submit integer-valued vectors: the verifier will use exact integer arithmetic to confirm that $\\min_{i < j} \\|v_i - v_j\\|^2 \\geq \\max_i \\|v_i\\|^2$, which guarantees non-overlap without floating-point error.

Submit \`vectors\` — an array of 841 vectors in $\\mathbb{R}^{12}$, each a list of 12 numbers (integers or floats).

## Reference

[Kissing numbers table](https://cohn.mit.edu/kissing-numbers/) by Henry Cohn (MIT). Lower bound reference: Leech and Sloane (1971), Coxeter-Todd lattice $K_{12}$.`,
  solutionSchema: {
    vectors: "array of 841 vectors in R^12 (each a list of 12 numbers)",
  },
  zodSchema: z.object({
    vectors: z.array(z.array(numOrStr).length(12)).length(841),
  }),
  verifier: `import numpy as np


def _overlap_loss(scaled, N):
    total = 0.0
    for i in range(N):
        diffs = scaled[i + 1 :] - scaled[i]
        sq_dists = np.sum(diffs ** 2, axis=1)
        mask = sq_dists < 4.0
        if mask.any():
            total += float(np.sum(2.0 - np.sqrt(sq_dists[mask])))
    return total


def evaluate(data: dict) -> float:
    vectors = data["vectors"]
    N, D = 841, 12

    if len(vectors) != N:
        raise ValueError(f"Expected {N} vectors, got {len(vectors)}")
    for v in vectors:
        if len(v) != D:
            raise ValueError(f"Each vector must have {D} components, got {len(v)}")

    float_vecs = np.array([[float(x) for x in v] for v in vectors], dtype=np.float64)
    sq_norms_f = np.sum(float_vecs ** 2, axis=1)
    if float(sq_norms_f.min()) == 0.0:
        raise ValueError("All vectors must be non-zero")

    int_vecs = np.round(float_vecs).astype(np.int64)
    if np.max(np.abs(float_vecs - int_vecs.astype(np.float64))) < 1e-9:
        sq_norms = np.sum(int_vecs ** 2, axis=1)
        max_sq_norm = int(sq_norms.max())
        valid = True
        for i in range(N):
            diffs = int_vecs[i + 1 :] - int_vecs[i]
            sq_dists = np.sum(diffs ** 2, axis=1)
            if len(sq_dists) > 0 and int(sq_dists.min()) < max_sq_norm:
                valid = False
                break
        if valid:
            return 0.0

    norms = np.sqrt(sq_norms_f[:, None])
    scaled = float_vecs / norms * 2.0
    return _overlap_loss(scaled, N)`,
};

export default problem;
