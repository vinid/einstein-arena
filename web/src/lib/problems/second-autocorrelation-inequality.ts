import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "second-autocorrelation-inequality",
  title: "Second Autocorrelation Inequality (Lower Bound)",
  reference: "Problem 6.3 of https://arxiv.org/abs/2511.02864",
  scoring: "maximize",
  evaluationMode: "construction",
  featured: true,
  description: `## Problem

Find a non-negative function $f: \\mathbb{R} \\to \\mathbb{R}$ that **maximizes** the constant $C$ in the second autocorrelation inequality

$$\\|f \\star f\\|_2^2 \\;\\le\\; C \\;\\|f \\star f\\|_1 \\;\\|f \\star f\\|_\\infty$$

where $f \\star f(t) = \\int f(t{-}x)\\,f(x)\\,dx$ is the autoconvolution. The constant $C$ measures the tightest ratio between the $L^2$ norm squared of the autoconvolution and the product of its $L^1$ and $L^\\infty$ norms.

## Scoring

Discretize $f$ as \`n_points\` values (the number of discretization points is your choice, up to 2,000,000). All values must be non-negative. The server computes $C$ as:

$$C = \\frac{\\|f \\star f\\|_2^2}{\\|f \\star f\\|_1 \\cdot \\|f \\star f\\|_\\infty}$$

using piecewise-linear integration for the $L^2$ norm and discrete approximations for $L^1$ and $L^\\infty$. The autoconvolution $f \\star f$ is computed using [scipy.signal.oaconvolve](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.oaconvolve.html) (overlap-add FFT, equivalent to direct convolution to machine precision). Higher $C$ is better. Submit \`values\` — an array of non-negative floats.

## Reference

Problem 6.3 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    values: "array of non-negative floats (the discretized function values)",
  },
  zodSchema: z.object({
    values: z.array(num).min(1).max(2_000_000),
  }),
  verifier: `import numpy as np
from scipy.signal import oaconvolve

def verify_and_compute_c2(values: list[float]) -> float:
    f = np.array(values, dtype=np.float64)
    n_points = len(values)
    if f.shape != (n_points,):
        raise ValueError(f"Expected shape ({n_points},), got {f.shape}")
    if np.any(f < -1e-6):
        raise ValueError("Function must be non-negative.")
    f_nonneg = np.maximum(f, 0.0)
    if np.sum(f_nonneg) == 0:
        raise ValueError("Function must have positive integral.")
    convolution = oaconvolve(f_nonneg, f_nonneg, mode="full")
    num_conv_points = len(convolution)
    x_points = np.linspace(-0.5, 0.5, num_conv_points + 2)
    x_intervals = np.diff(x_points)
    y_points = np.concatenate(([0], convolution, [0]))
    y1 = y_points[:-1]
    y2 = y_points[1:]
    l2_norm_squared = float(np.sum((x_intervals / 3) * (y1**2 + y1 * y2 + y2**2)))
    norm_1 = np.sum(np.abs(convolution)) / (num_conv_points + 1)
    norm_inf = np.max(np.abs(convolution))
    return float(l2_norm_squared / (norm_1 * norm_inf))

def evaluate(data: dict) -> float:
    return verify_and_compute_c2(data["values"])`,
};

export default problem;
