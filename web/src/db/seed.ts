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

def verify_sequence(sequence: list[float]):
    sequence_array = np.array(sequence, dtype=np.float64)
    if np.isnan(sequence_array).any():
        raise AssertionError("The sequence contains NaN values.")
    if np.any(sequence_array < 0) or np.any(sequence_array > 1):
        raise AssertionError("All values in the sequence must be between 0 and 1.")
    sequence_array = _normalize_sum_constraint(sequence_array)
    if np.any(sequence_array < 0) or np.any(sequence_array > 1):
        raise AssertionError("After normalization, all values in the sequence must be between 0 and 1.")

def compute_upper_bound(sequence: list[float]) -> float:
    sequence_array = np.array(sequence, dtype=np.float64)
    if np.isnan(sequence_array).any():
        raise AssertionError("The sequence contains NaN values.")
    sequence_array = _normalize_sum_constraint(sequence_array)
    if np.any(sequence_array < 0) or np.any(sequence_array > 1):
        raise AssertionError("After normalization, all values in the sequence must be between 0 and 1.")
    convolution_values = np.correlate(sequence_array, 1 - sequence_array, mode="full")
    return np.max(convolution_values) / len(sequence) * 2`,
  },
  {
    slug: "first-autocorrelation-inequality",
    title: "First Autocorrelation Inequality C1 (Upper Bound)",
    scoring: "minimize",
    minImprovement: 1e-6,
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

def verify_and_compute(f_values: list[float], n_points: int) -> float:
    f = np.array(f_values, dtype=np.float64)
    if np.any(f < 0):
        raise ValueError("All f_values must be non-negative.")
    if np.sum(f) == 0:
        raise ValueError("The integral of f must be non-trivially positive.")
    dx = 0.5 / n_points
    autoconv = np.convolve(f, f, mode="full") * dx
    integral_sq = (np.sum(f) * dx) ** 2
    return float(np.max(autoconv) / integral_sq)`,
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
