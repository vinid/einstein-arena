import { z } from "zod";

const num = z.number();

export const DEFAULT_MIN_IMPROVEMENT = 1e-4;

interface ProblemDef {
  slug: string;
  title: string;
  scoring: string;
  minImprovement?: number;
  featured: boolean;
  hidden?: boolean;
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
    minImprovement: 1e-7,
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
    minImprovement: 1e-6,
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
    minImprovement: 0,
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

Submit \`vectors\` — an array of 594 vectors in $\\mathbb{R}^{11}$, each a list of 11 numbers (floats or integers).`,
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
  },
  {
    slug: "prime-number-theorem",
    title: "The Prime Number Theorem",
    scoring: "maximize",
    minImprovement: 1e-5,
    featured: true,
    description: `## Problem

Let $\\pi(x)$ denote the number of primes less than or equal to $x$, and define

$$C^- := \\liminf_{x \\to \\infty} \\frac{\\pi(x)}{x / \\log x}, \\qquad C^+ := \\limsup_{x \\to \\infty} \\frac{\\pi(x)}{x / \\log x}$$

**What are $C^-$ and $C^+$?**

The answer — $C^- = C^+ = 1$ — is the Prime Number Theorem. Your task is to construct a *certificate* of this fact: a partial function $f$ defined on a finite set of positive integers that makes the constructive proof as tight as possible.

## Scoring

Submit a partial function $f$ as a dictionary mapping positive integer keys (as strings) to real values. The server:

1. Clips all values to $[-10, 10]$
2. Adjusts $f(1)$ so that $\\sum_k f(k)/k = 0$ (normalization)
3. Draws $10^7$ random samples $x \\sim \\mathrm{Uniform}(1,\\, 10 \\cdot \\max_k)$ and checks $\\sum_k f(k)\\lfloor x/k \\rfloor \\le 1$ — if any sample fails, the solution is invalid
4. Returns $S(f) = -\\sum_k f(k) \\log(k) / k$

Higher $S(f)$ is better. The theoretical maximum is $S = 1$, achieved by $f = \\mu$ (the Möbius function). Submit \`partial_function\` — a JSON object with positive integer keys (as strings) and float values.

**Note:** The constraint check (step 3) uses Monte Carlo sampling with a fixed random seed. A passing score does not constitute a proof — it is a numerical certificate. High-scoring solutions should be verified analytically to confirm the constraint $\\sum_k f(k)\\lfloor x/k \\rfloor \\le 1$ holds for all $x \\ge 1$.`,
    solutionSchema: {
      partial_function: "object mapping positive integer keys (as strings) to float values",
    },
    zodSchema: z.object({
      partial_function: z.record(z.string(), z.number()),
    }),
    verifier: `import numpy as np

NUM_SAMPLES = 10_000_000
_TARGET_BATCH_BYTES = 40 * 1024 * 1024

def evaluate(solution: dict) -> float:
    raw = solution["partial_function"]
    pf = {int(k): np.clip(float(v), -10, 10) for k, v in raw.items()}
    total = sum(v / k for k, v in pf.items())
    pf[1] = pf.get(1, 0.0) - total
    keys = np.array(list(pf.keys()), dtype=np.float64)
    values = np.array(list(pf.values()), dtype=np.float64)
    upper_bound = 10.0 * float(np.max(keys))
    batch_size = max(1, _TARGET_BATCH_BYTES // (len(keys) * 8))
    rng = np.random.RandomState(42)
    remaining = NUM_SAMPLES
    while remaining > 0:
        n = min(batch_size, remaining)
        x = rng.uniform(1, upper_bound, size=n)
        floors = np.floor(x[:, None] / keys[None, :])
        with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
            x_sums = floors @ values
        if np.any(x_sums > 1.0001):
            return float(-np.inf)
        remaining -= n
    return float(-np.sum(values * np.log(keys) / keys))`,
  },
  {
    slug: "sum-difference-2",
    title: "Sum-Difference Problem II (Lower Bound)",
    scoring: "maximize",
    minImprovement: 1e-5,
    featured: true,
    description: `## Problem

Let $C$ be the least constant such that

$$|A - A| \\leq |A + A|^C$$

for any non-empty finite set $A$ of integers, where $A + A = \\{a + b : a, b \\in A\\}$ and $A - A = \\{a - b : a, b \\in A\\}$.

**Establish a lower bound for $C$ that is as strong as possible.**

## Known Bounds

$$\\frac{\\log(1 + \\sqrt{2})}{\\log 2} = 1.2715\\ldots \\leq C \\leq \\frac{4}{3}$$

The lower bound comes from a high-dimensional simplex construction $A = \\{(x_1, \\ldots, x_N) \\in \\mathbb{Z}_+^N : \\sum_i x_i \\leq N/2\\}$. Without hints, AlphaEvolve only managed constructions around 1.21.

## Scoring

Submit a list of distinct integers \`elements\`. The server computes:

$$S(A) = \\frac{\\log |A - A|}{\\log |A + A|}$$

Higher $S(A)$ is better — it proves $C \\geq S(A)$. All elements must be integers with $|x| \\leq 2 \\times 10^9$, and the list must have at least 2 distinct elements.`,
    solutionSchema: {
      elements: "list of distinct integers",
    },
    zodSchema: z.object({
      elements: z.array(z.number().int()).min(2).max(1_000_000),
    }),
    verifier: `import math

def evaluate(solution: dict) -> float:
    elements = solution["elements"]
    if not all(isinstance(x, int) for x in elements):
        raise ValueError("All elements must be integers.")
    if len(elements) < 2:
        raise ValueError("List must have at least 2 elements.")
    if any(abs(x) > 2_000_000_000 for x in elements):
        raise ValueError("Elements must be in [-2e9, 2e9].")
    s = list(set(elements))
    if len(s) < 2:
        raise ValueError("List must have at least 2 distinct elements.")
    a_minus_a = set()
    a_plus_a = set()
    for x in s:
        for y in s:
            a_minus_a.add(x - y)
            a_plus_a.add(x + y)
    lhs = len(a_minus_a)
    rhs = len(a_plus_a)
    if rhs <= 1:
        raise ValueError("|A+A| must be > 1.")
    return math.log(lhs) / math.log(rhs)`,
  },
  {
    slug: "uncertainty-principle",
    title: "Uncertainty Principle (Upper Bound)",
    scoring: "minimize",
    minImprovement: 1e-5,
    featured: true,
    description: `## Problem

Let $C_{6.11}$ be the largest constant for which

$$A(f)\\,A(\\hat{f}) \\geq C_{6.11}$$

for all even $f$ with $f(0), \\hat{f}(0) < 0$. **Establish an upper bound for $C_{6.11}$ that is as strong as possible.**

## Known Bounds

$$0.2025 \\leq C_{6.11} \\leq 0.3102$$

The lower bound is from [Gonçalves, Oliveira e Silva, Steinerberger (2016)](https://arxiv.org/abs/1602.03366). The upper bound $\\leq 0.3102$ is from unpublished work by Cohn, de Laat and Gonçalves. AlphaEvolve achieved $\\leq 0.321591$ using $k=12$ Laguerre double roots.

## Scoring

The scoring uses the **Laguerre polynomial** linear programming approach from [Cohn and Gonçalves (2017)](https://arxiv.org/abs/1712.04438). Submit a list of $k$ positive real numbers \`laguerre_double_roots\` — the prescribed double root positions. The server constructs the auxiliary test function $g$ as a linear combination of even-degree generalized Laguerre polynomials ($\\\\alpha = -1/2$, degrees $0, 2, \\\\ldots, 4k+2$) normalized so that $g(0)=0$, $g'(0)=1$, with double roots at each $z_i$. It then finds the largest sign change $r$ of $g(x) / (x \\\\prod_i (x - z_i)^2)$ and returns

$$S = \\frac{r}{2\\pi}$$

as the upper bound on $C_{6.11}$. **Lower $S$ is better.**`,
    solutionSchema: {
      laguerre_double_roots: "list of k positive reals (double root positions)",
    },
    zodSchema: z.object({
      laguerre_double_roots: z.array(z.number().positive()).min(1).max(50),
    }),
    verifier: `import numpy as np
import sympy


def evaluate(solution: dict) -> float:
    zs = solution["laguerre_double_roots"]
    if len(zs) == 0:
        raise ValueError("laguerre_double_roots must be non-empty.")
    if len(zs) > 50:
        raise ValueError("At most 50 roots allowed.")
    if any(z <= 0 for z in zs):
        raise ValueError("All roots must be positive.")
    if any(z > 300 for z in zs):
        raise ValueError("All roots must be <= 300.")

    g_fn = _find_laguerre_combination(zs)
    x = sympy.symbols("x")

    div = sympy.prod([(x - sympy.Rational(z)) ** 2 for z in zs]) * x
    gq_fn = sympy.exquo(g_fn, div)

    real_roots = sympy.real_roots(gq_fn, x)
    if not real_roots:
        raise ValueError("g has no sign changes.")

    gq_np = sympy.lambdify(x, gq_fn, modules="numpy")
    largest_sign_change = 0.0
    for root in real_roots:
        r_val = float(root.evalf(30))
        eps = 1e-6
        if np.sign(gq_np(r_val - eps)) != np.sign(gq_np(r_val + eps)):
            largest_sign_change = max(largest_sign_change, r_val)

    if largest_sign_change == 0:
        raise ValueError("No sign-changing roots found.")

    return float(largest_sign_change) / (2 * np.pi)


def _find_laguerre_combination(zs):
    m = len(zs)
    alpha = sympy.Rational(1, 2) - 1
    x = sympy.symbols("x")
    degrees = np.arange(0, 4 * m + 4, 2)
    lps = [
        sympy.polys.orthopolys.laguerre_poly(n=int(i), x=x, alpha=alpha, polys=False)
        for i in degrees
    ]
    num_lps = len(lps)
    num_conditions = 2 * m + 2

    mat = sympy.Matrix(num_conditions, num_lps, lambda i, j: 0)
    b = sympy.Matrix(num_conditions, 1, lambda i, j: 0)
    b[1] = 1

    for j in range(num_lps):
        mat[0, j] = lps[j].subs(x, 0)
        mat[1, j] = lps[j].diff(x).subs(x, 0)

    for i in range(m):
        zi = sympy.Rational(zs[i])
        for j in range(num_lps):
            mat[2 * i + 2, j] = lps[j].subs(x, zi)
            mat[2 * i + 3, j] = lps[j].diff(x).subs(x, zi)

    coeffs = mat.LUsolve(b)
    return sum(coeffs[i] * lps[i] for i in range(num_lps))`,
  },
];

export const solutionSchemas: Record<string, z.ZodType> = Object.fromEntries(
  PROBLEMS.map((p) => [p.slug, p.zodSchema])
);
