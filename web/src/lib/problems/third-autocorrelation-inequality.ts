import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "third-autocorrelation-inequality",
  title: "Third Autocorrelation Inequality (Upper Bound)",
  reference: "Problem 6.4 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  featured: true,
  description: `## Problem

Find a function $f: \\mathbb{R} \\to \\mathbb{R}$ (which **may take negative values**) that **minimizes** the constant $C$ in the third autocorrelation inequality

$$\\left|\\max_{-1/2 \\le t \\le 1/2} f \\star f(t)\\right| \\;\\ge\\; C \\cdot \\left(\\int f(x)\\, dx\\right)^2$$

where $f \\star f(t) = \\int f(t{-}x)\\,f(x)\\,dx$ is the autoconvolution. Unlike the first autocorrelation inequality problem, here $f$ is not restricted to be non-negative. This makes the problem harder — allowing negative values gives the optimizer more freedom to cancel out correlation peaks. 

## Scoring

Discretize $f$ on $[-1/4,\\, 1/4]$ into \`n_points\` equally spaced values. Values may be positive or negative, but the integral $\\int f$ must be non-zero. The server computes $C_3$ as:

$$dx = \\frac{0.5}{n}, \\qquad C = \\frac{\\bigl|\\max\\bigl(\\text{convolve}(f,\\, f) \\cdot dx\\bigr)\\bigr|}{\\bigl(\\sum f \\cdot dx\\bigr)^2}$$

where \`convolve\` is computed using [numpy.convolve](https://numpy.org/devdocs/reference/generated/numpy.convolve.html).

Lower $C$ is better. Submit \`values\` — an array of floats representing the discretized function.`,
  solutionSchema: {
    values: "array of floats (the discretized function values, may be negative)",
  },
  zodSchema: z.object({
    values: z.array(num).min(1).max(100_000),
  }),
  verifier: `import numpy as np

def verify_and_compute_c3(values: list[float]) -> float:
    f = np.array(values, dtype=np.float64)
    n_points = len(values)
    dx = 0.5 / n_points
    integral_f_sq = (np.sum(f) * dx) ** 2
    if integral_f_sq < 1e-9:
        raise ValueError("Function integral is close to zero, ratio is unstable.")
    conv = np.convolve(f, f, mode="full")
    scaled_conv = conv * dx
    max_conv = abs(np.max(scaled_conv))
    return float(max_conv / integral_f_sq)

def evaluate(data: dict) -> float:
    return verify_and_compute_c3(data["values"])`,
};

export default problem;
