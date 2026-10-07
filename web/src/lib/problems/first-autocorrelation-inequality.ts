import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "first-autocorrelation-inequality",
  title: "First Autocorrelation Inequality (Upper Bound)",
  reference: "Problem 6.2 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-8,
  evaluationMode: "construction",
  featured: true,
  description: `## Problem

Find a non-negative function $f: \\mathbb{R} \\to \\mathbb{R}$ that minimizes the constant $C$ in the autocorrelation inequality

$$\\max_{t}\\; (f \\star f)(t) \\;\\ge\\; C \\cdot \\left(\\int f(x)\\, dx\\right)^2$$

where $f \\star f(t) = \\int f(t{-}x)\\, f(x)\\, dx$ is the autoconvolution. This is a classical problem in harmonic analysis — $C$ measures how "peaky" a non-negative function must be relative to its autoconvolution. 

## Scoring

Discretize $f$ on $[-1/4,\\, 1/4]$ into \`n_points\` equally spaced values. All values must be non-negative with positive integral. The server computes $C$ as:

$$dx = \\frac{0.5}{n}, \\qquad C = \\frac{\\max\\bigl(\\text{convolve}(f,\\, f) \\cdot dx\\bigr)}{\\bigl(\\sum f \\cdot dx\\bigr)^2}$$

where \`convolve\` is computed using [numpy.convolve](https://numpy.org/devdocs/reference/generated/numpy.convolve.html).

Lower $C$ is better. Submit \`values\` — an array of non-negative floats representing the discretized function.

## Reference

Problem 6.2 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    values: "array of non-negative floats (the discretized function values)",
  },
  zodSchema: z.object({
    values: z.array(num).min(1).max(100_000),
  }),
  verifier: `import numpy as np

def verify_and_compute(values: list[float]) -> float:
    f = np.array(values, dtype=np.float64)
    if f.ndim != 1 or len(f) == 0:
        raise ValueError("values must be a non-empty flat list of numbers.")
    if not np.all(np.isfinite(f)):
        raise ValueError("All values must be finite.")
    if np.any(f < 0):
        raise ValueError("All values must be non-negative.")
    peak = np.max(f)
    if peak <= 0:
        raise ValueError("The integral of f must be non-trivially positive.")
    # C is invariant under scaling f, so normalizing first removes underflow/overflow exploits
    # (e.g. a single subnormal value whose squares round to the same number and score 1.0).
    f = f / peak
    n_points = len(f)
    dx = 0.5 / n_points
    autoconv = np.convolve(f, f, mode="full") * dx
    integral_sq = (np.sum(f) * dx) ** 2
    c = float(np.max(autoconv) / integral_sq)

    size = 1 << (2 * n_points - 1).bit_length()
    fft_conv = np.fft.irfft(np.fft.rfft(f, size) ** 2, size)[: 2 * n_points - 1] * dx
    c_fft = float(np.max(fft_conv) / integral_sq)
    if not np.isfinite(c) or abs(c - c_fft) > 1e-9 * c:
        raise ValueError("Numerically unstable solution: direct and FFT autoconvolution disagree.")
    # The max of the 2n-1 autoconvolution entries is at least their mean, so every valid f scores >= 2n/(2n-1).
    if c < (2 * n_points / (2 * n_points - 1)) * (1 - 1e-12):
        raise ValueError("Score is below the discrete lower bound; the computation is numerically invalid.")
    return c

def evaluate(data: dict) -> float:
    return verify_and_compute(data["values"])`,
};

export default problem;
