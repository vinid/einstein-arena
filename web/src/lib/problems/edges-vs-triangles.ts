import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "edges-vs-triangles",
  title: "Edges vs Triangles (Minimal Triangle Density)",
  reference: "Problem 6.46 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  minImprovement: 1e-6,
  evaluationMode: "construction",
  featured: false,
  hidden: true,
  description: `## Problem

For $0 \\le \\rho \\le 1$, let $C(\\rho)$ denote the largest quantity such that any graph on $n$ vertices and $(\\rho + o(1))\\binom{n}{2}$ edges will have at least $(C(\\rho) - o(1))\\binom{n}{3}$ triangles. What is $C(\\rho)$?

This is the Razborov flag-algebra problem on the minimum triangle density as a function of edge density. The goal is to construct a tight lower bound on $C(\\rho)$ over the full range $\\rho \\in [0,1]$.

## Encoding

Each row of the solution is a probability distribution over 20 bins. The verifier computes edge density and triangle density per row using Newton's power-sum identities. Each point $(\\rho_i, t_i)$ extends a horizontal line to the left and a line of slope 3 to the right. The area under the lower envelope of these lines is an upper bound on $\\int_0^1 C(\\rho)\\,d\\rho$.

## Scoring

Submit \`weights\` — a 2D array of shape $(m, 20)$ where $m \\le 500$ and each row has non-negative entries (rows are normalized to sum to 1). The score is

$$\\text{score} = -(\\text{area} + 10 \\cdot \\text{max\\_gap})$$

where $\\text{max\\_gap}$ is the largest gap between consecutive edge densities. Higher (less negative) is better. The gap penalty encourages dense coverage of the $\\rho$ axis.

## Reference

Problem 6.46 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    weights: "2D array of shape (m, 20), each row non-negative",
  },
  zodSchema: z.object({
    weights: z.array(z.array(num).length(20)).min(1).max(500),
  }),
  verifier: `import numpy as np

def sum_pairwise_triple_products_batch(A):
    A = np.array(A, dtype=np.float64)
    M, N = A.shape
    triple_sums = np.zeros(M, dtype=A.dtype)
    if N < 2:
        return np.zeros(M, dtype=A.dtype), triple_sums
    S1 = np.sum(A, axis=1)
    S2 = np.sum(np.square(A), axis=1)
    pairwise_sums = np.square(S1) - S2
    if N >= 3:
        S3 = np.sum(np.power(A, 3), axis=1)
        triple_sums = np.power(S1, 3) - 3 * S1 * S2 + 2 * S3
    return pairwise_sums, triple_sums

def analyze_density_curve(edge_densities, triangle_densities, gap_range_min=0.0, gap_range_max=1.0):
    if edge_densities.shape != triangle_densities.shape or edge_densities.ndim != 1:
        return -1.0, -1.0
    slope = 3.0
    if edge_densities.size > 0:
        sort_indices = np.argsort(edge_densities)
        sorted_x = edge_densities[sort_indices]
        sorted_y = triangle_densities[sort_indices]
        dtype = sorted_x.dtype
        full_x = np.concatenate(([np.array(0.0, dtype=dtype)], sorted_x, [np.array(1.0, dtype=dtype)]))
        full_y = np.concatenate(([np.array(0.0, dtype=dtype)], sorted_y, [np.array(1.0, dtype=dtype)]))
        uniq_x, inv = np.unique(full_x, return_inverse=True)
        min_y = np.full(len(uniq_x), np.inf, dtype=dtype)
        np.minimum.at(min_y, inv, full_y)
        full_x, full_y = uniq_x, min_y
    else:
        full_x = np.array([0.0, 1.0])
        full_y = np.array([0.0, 1.0])
    if len(full_x) < 2:
        area = 5.0 / 6.0
        max_gap_in_range = 1.0 if gap_range_min <= 0.0 < gap_range_max else 0.0
        return area, max_gap_in_range
    intercepts = full_y - slope * full_x
    left_ray = np.minimum.accumulate(intercepts)
    right_flat = np.minimum.accumulate(full_y[::-1])[::-1]
    total_area = 0.0
    for i in range(len(full_x) - 1):
        x0, x1 = full_x[i], full_x[i + 1]
        w = x1 - x0
        if w <= 0:
            continue
        cap = min(float(right_flat[i + 1]), 1.0)
        y_left = slope * x0 + left_ray[i]
        y_right = slope * x1 + left_ray[i]
        if y_left >= cap:
            segment_area = cap * w
        elif y_right <= cap:
            segment_area = (y_left + y_right) * w / 2.0
        else:
            x_hit = (cap - left_ray[i]) / slope
            w1 = x_hit - x0
            w2 = x1 - x_hit
            segment_area = (y_left + cap) * w1 / 2.0 + cap * w2
        total_area += segment_area
    gaps = np.diff(full_x)
    indices_in_range = np.where((full_x[:-1] >= gap_range_min) & (full_x[:-1] < gap_range_max))[0]
    max_gap_in_range = float(np.max(gaps[indices_in_range])) if indices_in_range.size > 0 else 0.0
    return total_area, max_gap_in_range

def evaluate(data):
    solutions = np.array(data["weights"], dtype=np.float64)
    max_length = 20
    for i, solution in enumerate(solutions):
        assert len(solution) == max_length, f"Row {i} has length {len(solution)}, expected {max_length}"
        assert np.all(solution >= 0), f"Row {i} contains negative entries"
        assert np.sum(solution) >= 1e-7, f"Row {i} sums to near zero"
        solutions[i] = solution / np.sum(solution)
    edge_densities, triangle_densities = sum_pairwise_triple_products_batch(solutions)
    assert not np.any(np.isnan(edge_densities)), "NaN in edge densities"
    assert not np.any(np.isnan(triangle_densities)), "NaN in triangle densities"
    area, max_gap_in_range = analyze_density_curve(edge_densities, triangle_densities)
    return -(area + 10 * max_gap_in_range)`,
};

export default problem;
