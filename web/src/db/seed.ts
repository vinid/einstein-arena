import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});
const db = drizzle(pool, { schema });

const PROBLEMS = [
  {
    slug: "erdos-min-overlap",
    title: "Erdős Minimum Overlap (Upper Bound)",
    scoring: "minimize",
    minImprovement: 1e-6,
    featured: true,
    description: `## Problem

Find a step function $h: [0, 2] \\to [0, 1]$ that **minimizes** the overlap integral

$$C_5 = \\max_k \\int h(x)\\,(1 - h(x+k))\\, dx$$

subject to the constraints $h(x) \\in [0, 1]$ for all $x$ and $\\int_0^2 h(x)\\, dx = 1$.

## Scoring

Represent $h$ as \`n_points\` equally spaced samples over $[0, 2]$, with $dx = 2/n$. All values must satisfy $0 \\le h[i] \\le 1$. The sum is normalized to $n/2$ before scoring. The server evaluates:

$$C_5 = \\max\\bigl(\\text{correlate}(h,\\; 1{-}h,\\; \\texttt{full})\\bigr) \\cdot dx$$

Lower $C_5$ is better. Submit \`h_values\` — an array of floats representing the discretized function.`,
    solutionSchema: {
      h_values: "array of floats (the discretized function values)",
    },
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
    return compute_upper_bound(data["h_values"])`,
  },
  {
    slug: "first-autocorrelation-inequality",
    title: "First Autocorrelation Inequality C1 (Upper Bound)",
    scoring: "minimize",
    minImprovement: 1e-6,
    featured: true,
    description: `## Problem

Find a non-negative function $f: \\mathbb{R} \\to \\mathbb{R}$ that minimizes the constant $C_1$ in the autocorrelation inequality

$$\\max_{t}\\; (f \\star f)(t) \\;\\ge\\; C_1 \\cdot \\left(\\int f(x)\\, dx\\right)^2$$

where $f \\star f(t) = \\int f(t{-}x)\\, f(x)\\, dx$ is the autoconvolution. This is a classical problem in harmonic analysis — $C_1$ measures how "peaky" a non-negative function must be relative to its autoconvolution. The best known lower bound is $C_1 \\ge 1.28$.

## Scoring

Discretize $f$ on $[-1/4,\\, 1/4]$ into \`n_points\` equally spaced values. All values must be non-negative with positive integral. The server computes $C_1$ as:

$$dx = \\frac{0.5}{n}, \\qquad C_1 = \\frac{\\max\\bigl(\\text{convolve}(f,\\, f) \\cdot dx\\bigr)}{\\bigl(\\sum f \\cdot dx\\bigr)^2}$$

Lower $C_1$ is better. Submit \`f_values\` — an array of non-negative floats representing the discretized function.`,
    solutionSchema: {
      f_values: "array of non-negative floats (the discretized function values)",
    },
    verifier: `import numpy as np

def verify_and_compute(f_values: list[float]) -> float:
    f = np.array(f_values, dtype=np.float64)
    if np.any(f < 0):
        raise ValueError("All f_values must be non-negative.")
    if np.sum(f) == 0:
        raise ValueError("The integral of f must be non-trivially positive.")
    n_points = len(f_values)
    dx = 0.5 / n_points
    autoconv = np.convolve(f, f, mode="full") * dx
    integral_sq = (np.sum(f) * dx) ** 2
    return float(np.max(autoconv) / integral_sq)

def evaluate(data: dict) -> float:
    return verify_and_compute(data["f_values"])`,
  },
  {
    slug: "second-autocorrelation-inequality",
    title: "Second Autocorrelation Inequality C₂ (Lower Bound)",
    scoring: "maximize",
    minImprovement: 1e-6,
    description: `## Problem

Find a non-negative function $f: \\mathbb{R} \\to \\mathbb{R}$ that **maximizes** the constant $C_2$ in the second autocorrelation inequality

$$\\|f \\star f\\|_2^2 \\;\\le\\; C_2 \\;\\|f \\star f\\|_1 \\;\\|f \\star f\\|_\\infty$$

where $f \\star f(t) = \\int f(t{-}x)\\,f(x)\\,dx$ is the autoconvolution. The constant $C_2$ measures the tightest ratio between the $L^2$ norm squared of the autoconvolution and the product of its $L^1$ and $L^\\infty$ norms. By Young's inequality, $C_2 \\le 1$. The best known lower bound is $C_2 \\ge 0.8963$ (AlphaEvolve, step functions). The theoretical lower bound is $C_2 \\ge 0.8892$.

## Scoring

Discretize $f$ as \`n_points\` values (the number of discretization points is your choice). All values must be non-negative. The server computes $C_2$ as:

$$C_2 = \\frac{\\|f \\star f\\|_2^2}{\\|f \\star f\\|_1 \\cdot \\|f \\star f\\|_\\infty}$$

using piecewise-linear integration for the $L^2$ norm and discrete approximations for $L^1$ and $L^\\infty$. Higher $C_2$ is better. Submit \`f_values\` — an array of non-negative floats.`,
    solutionSchema: {
      f_values: "array of non-negative floats (the discretized function values)",
    },
    verifier: `import numpy as np

def verify_and_compute_c2(f_values: list[float]) -> float:
    f = np.array(f_values, dtype=np.float64)
    n_points = len(f_values)
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
    return verify_and_compute_c2(data["f_values"])`,
  },
  {
    slug: "third-autocorrelation-inequality",
    title: "Third Autocorrelation Inequality C₃ (Upper Bound)",
    scoring: "minimize",
    minImprovement: 1e-6,
    description: `## Problem

Find a function $f: \\mathbb{R} \\to \\mathbb{R}$ (which **may take negative values**) that **minimizes** the constant $C_3$ in the third autocorrelation inequality

$$\\max_{t}\\; |f \\star f(t)| \\;\\ge\\; C_3 \\cdot \\left(\\int f(x)\\, dx\\right)^2$$

where $f \\star f(t) = \\int f(t{-}x)\\,f(x)\\,dx$ is the autoconvolution. Unlike $C_1$, here $f$ is not restricted to be non-negative, and we take the **absolute value** of the autoconvolution. This makes the problem harder — allowing negative values gives the optimizer more freedom to cancel out correlation peaks. The current best upper bound is $C_3 \\le 1.4556$ (AlphaEvolve). The best known lower bound is $C_3 \\ge 1.28$.

## Scoring

Discretize $f$ on $[-1/4,\\, 1/4]$ into \`n_points\` equally spaced values. Values may be positive or negative, but the integral $\\int f$ must be non-zero. The server computes $C_3$ as:

$$dx = \\frac{0.5}{n}, \\qquad C_3 = \\frac{\\max\\bigl|\\text{convolve}(f,\\, f) \\cdot dx\\bigr|}{\\bigl(\\sum f \\cdot dx\\bigr)^2}$$

Lower $C_3$ is better. Submit \`f_values\` — an array of floats representing the discretized function.`,
    solutionSchema: {
      f_values: "array of floats (the discretized function values, may be negative)",
    },
    verifier: `import numpy as np

def verify_and_compute_c3(f_values: list[float]) -> float:
    f = np.array(f_values, dtype=np.float64)
    n_points = len(f_values)
    dx = 0.5 / n_points
    integral_f_sq = (np.sum(f) * dx) ** 2
    if integral_f_sq < 1e-9:
        raise ValueError("Function integral is close to zero, ratio is unstable.")
    conv = np.convolve(f, f, mode="full")
    scaled_conv = conv * dx
    max_abs_conv = np.max(np.abs(scaled_conv))
    return float(max_abs_conv / integral_f_sq)

def evaluate(data: dict) -> float:
    return verify_and_compute_c3(data["f_values"])`,
  },
];

async function seed() {
  for (const p of PROBLEMS) {
    const existing = await db
      .select()
      .from(schema.problems)
      .where(eq(schema.problems.slug, p.slug))
      .limit(1);

    if (existing.length > 0) {
      console.log(`Skipping ${p.slug} — already exists`);
      continue;
    }

    await db.insert(schema.problems).values(p);
    console.log(`Inserted ${p.slug}`);
  }

  await pool.end();
  console.log("Seed complete");
}

seed();
