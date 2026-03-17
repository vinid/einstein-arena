import { z } from "zod";

const num = z.number();

interface ProblemDef {
  slug: string;
  title: string;
  scoring: string;
  minImprovement: number;
  featured: boolean;
  description: string;
  solutionSchema: Record<string, string>;
  verifier: string;
  zodSchema: z.ZodType;
}

export const PROBLEMS: ProblemDef[] = [
  {
    slug: "erdos-min-overlap",
    title: "Erdős Minimum Overlap (Upper Bound)",
    scoring: "minimize",
    minImprovement: 1e-6,
    featured: true,
    description: `## Problem

Find a step function $h: [0, 2] \\to [0, 1]$ that **minimizes** the overlap integral

$$C = \\max_k \\int h(x)\\,(1 - h(x+k))\\, dx$$

subject to the constraints $h(x) \\in [0, 1]$ for all $x$ and $\\int_0^2 h(x)\\, dx = 1$.

## Scoring

Represent $h$ as \`n_points\` equally spaced samples over $[0, 2]$, with $dx = 2/n$. All values must satisfy $0 \\le h[i] \\le 1$. The sum is normalized to $n/2$ before scoring. The server evaluates:

$$C = \\max\\bigl(\\text{correlate}(h,\\; 1{-}h,\\; \\texttt{full})\\bigr) \\cdot dx$$

where \`correlate\` is computed using [numpy.correlate](https://numpy.org/doc/stable/reference/generated/numpy.correlate.html) with \`mode="full"\`.

Lower $C$ is better. Submit \`values\` — an array of floats representing the discretized function.`,
    solutionSchema: {
      values: "array of floats (the discretized function values)",
    },
    zodSchema: z.object({
      values: z.array(num).min(1).max(100_000),
    }),
    verifier: `import numpy as np

def _normalize_sum_constraint(sequence_array: np.ndarray) -> np.ndarray:
    target_sum = len(sequence_array) / 2.0
    current_sum = float(np.sum(sequence_array))
    if current_sum != target_sum:
        if current_sum == 0.0:
            raise AssertionError("Cannot normalize sequence with zero total sum.")
        sequence_array = sequence_array * (target_sum / current_sum)
    return sequence_array

def compute_upper_bound(sequence: list[float]) -> float:
    sequence_array = np.array(sequence, dtype=np.float64)
    if np.isnan(sequence_array).any():
        raise AssertionError("The sequence contains NaN values.")
    if np.any(sequence_array < 0) or np.any(sequence_array > 1):
        raise AssertionError("All values in the sequence must be between 0 and 1.")
    sequence_array = _normalize_sum_constraint(sequence_array)
    if np.any(sequence_array < 0) or np.any(sequence_array > 1):
        raise AssertionError("After normalization, all values in the sequence must be between 0 and 1.")
    convolution_values = np.correlate(sequence_array, 1 - sequence_array, mode="full")
    return np.max(convolution_values) / len(sequence) * 2

def evaluate(data: dict) -> float:
    return compute_upper_bound(data["values"])`,
  },
  {
    slug: "first-autocorrelation-inequality",
    title: "First Autocorrelation Inequality (Upper Bound)",
    scoring: "minimize",
    minImprovement: 1e-5,
    featured: true,
    description: `## Problem

Find a non-negative function $f: \\mathbb{R} \\to \\mathbb{R}$ that minimizes the constant $C$ in the autocorrelation inequality

$$\\max_{t}\\; (f \\star f)(t) \\;\\ge\\; C \\cdot \\left(\\int f(x)\\, dx\\right)^2$$

where $f \\star f(t) = \\int f(t{-}x)\\, f(x)\\, dx$ is the autoconvolution. This is a classical problem in harmonic analysis — $C$ measures how "peaky" a non-negative function must be relative to its autoconvolution. 

## Scoring

Discretize $f$ on $[-1/4,\\, 1/4]$ into \`n_points\` equally spaced values. All values must be non-negative with positive integral. The server computes $C$ as:

$$dx = \\frac{0.5}{n}, \\qquad C = \\frac{\\max\\bigl(\\text{convolve}(f,\\, f) \\cdot dx\\bigr)}{\\bigl(\\sum f \\cdot dx\\bigr)^2}$$

where \`convolve\` is computed using [numpy.convolve](https://numpy.org/devdocs/reference/generated/numpy.convolve.html).

Lower $C$ is better. Submit \`values\` — an array of non-negative floats representing the discretized function.`,
    solutionSchema: {
      values: "array of non-negative floats (the discretized function values)",
    },
    zodSchema: z.object({
      values: z.array(num).min(1).max(100_000),
    }),
    verifier: `import numpy as np

def verify_and_compute(values: list[float]) -> float:
    f = np.array(values, dtype=np.float64)
    if np.any(f < 0):
        raise ValueError("All values must be non-negative.")
    if np.sum(f) == 0:
        raise ValueError("The integral of f must be non-trivially positive.")
    n_points = len(values)
    dx = 0.5 / n_points
    autoconv = np.convolve(f, f, mode="full") * dx
    integral_sq = (np.sum(f) * dx) ** 2
    return float(np.max(autoconv) / integral_sq)

def evaluate(data: dict) -> float:
    return verify_and_compute(data["values"])`,
  },
  {
    slug: "second-autocorrelation-inequality",
    title: "Second Autocorrelation Inequality (Lower Bound)",
    scoring: "maximize",
    minImprovement: 1e-4,
    featured: true,
    description: `## Problem

Find a non-negative function $f: \\mathbb{R} \\to \\mathbb{R}$ that **maximizes** the constant $C$ in the second autocorrelation inequality

$$\\|f \\star f\\|_2^2 \\;\\le\\; C \\;\\|f \\star f\\|_1 \\;\\|f \\star f\\|_\\infty$$

where $f \\star f(t) = \\int f(t{-}x)\\,f(x)\\,dx$ is the autoconvolution. The constant $C$ measures the tightest ratio between the $L^2$ norm squared of the autoconvolution and the product of its $L^1$ and $L^\\infty$ norms.

## Scoring

Discretize $f$ as \`n_points\` values (the number of discretization points is your choice). All values must be non-negative. The server computes $C$ as:

$$C = \\frac{\\|f \\star f\\|_2^2}{\\|f \\star f\\|_1 \\cdot \\|f \\star f\\|_\\infty}$$

using piecewise-linear integration for the $L^2$ norm and discrete approximations for $L^1$ and $L^\\infty$. The autoconvolution $f \\star f$ is computed using [numpy.convolve](https://numpy.org/devdocs/reference/generated/numpy.convolve.html). Higher $C$ is better. Submit \`values\` — an array of non-negative floats.`,
    solutionSchema: {
      values: "array of non-negative floats (the discretized function values)",
    },
    zodSchema: z.object({
      values: z.array(num).min(1).max(100_000),
    }),
    verifier: `import numpy as np

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
    convolution = np.convolve(f_nonneg, f_nonneg, mode="full")
    num_conv_points = len(convolution)
    x_points = np.linspace(-0.5, 0.5, num_conv_points + 2)
    x_intervals = np.diff(x_points)
    y_points = np.concatenate(([0], convolution, [0]))
    l2_norm_squared = 0.0
    for i in range(num_conv_points + 1):
        y1, y2, h = y_points[i], y_points[i + 1], x_intervals[i]
        l2_norm_squared += (h / 3) * (y1**2 + y1 * y2 + y2**2)
    norm_1 = np.sum(np.abs(convolution)) / (num_conv_points + 1)
    norm_inf = np.max(np.abs(convolution))
    return float(l2_norm_squared / (norm_1 * norm_inf))

def evaluate(data: dict) -> float:
    return verify_and_compute_c2(data["values"])`,
  },
  {
    slug: "third-autocorrelation-inequality",
    title: "Third Autocorrelation Inequality (Upper Bound)",
    scoring: "minimize",
    minImprovement: 1e-4,
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
  },
  {
    slug: "min-distance-ratio-2d",
    title: "Minimizing Max/Min Distance Ratio (2D, n=16)",
    scoring: "minimize",
    minImprovement: 1e-5,
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
  },
  {
    slug: "kissing-number-d11",
    title: "Kissing Number in Dimension 11 (n=594)",
    scoring: "minimize",
    minImprovement: 1e-6,
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

A score of **0** means all 594 spheres are non-overlapping — a valid kissing configuration proving the kissing number in dimension 11 is at least 594. Any score $> 0$ means some spheres still overlap.

Lower is better. Submit \`vectors\` — an array of 594 vectors, each a list of 11 floats.`,
    solutionSchema: {
      vectors: "array of 594 vectors in R^11 (each a list of 11 floats)",
    },
    zodSchema: z.object({
      vectors: z.array(z.array(num).length(11)).length(594),
    }),
    verifier: `import numpy as np

def evaluate(data: dict) -> float:
    vectors = np.array(data["vectors"], dtype=np.float64)
    if vectors.ndim != 2 or vectors.shape[0] != 594 or vectors.shape[1] != 11:
        raise ValueError(f"Expected shape (594, 11), got {vectors.shape}")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if np.any(norms < 1e-12):
        raise ValueError("All vectors must be non-zero")
    centers = 2.0 * vectors / norms
    diff = centers[:, None, :] - centers[None, :, :]
    dist_matrix = np.sqrt(np.sum(diff ** 2, axis=-1))
    n = centers.shape[0]
    mask = np.triu(np.ones((n, n), dtype=bool), k=1)
    pairwise = dist_matrix[mask]
    penalties = np.maximum(0.0, 2.0 - pairwise)
    return float(np.sum(penalties))`,
  },
];

export const solutionSchemas: Record<string, z.ZodType> = Object.fromEntries(
  PROBLEMS.map((p) => [p.slug, p.zodSchema])
);
