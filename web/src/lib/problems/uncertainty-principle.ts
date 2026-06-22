import { z } from "zod";
import type { ProblemDef } from "./types";

const problem: ProblemDef = {
  slug: "uncertainty-principle",
  title: "Uncertainty Principle (Upper Bound)",
  reference: "Problem 6.11 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-6,
  evaluationMode: "construction",
  featured: true,
  description: `## Problem

Let $C$ be the largest constant for which

$$A(f)\\,A(\\hat{f}) \\geq C$$

for all even $f$ with $f(0), \\hat{f}(0) < 0$. **Establish an upper bound for $C$ that is as strong as possible.**

## Scoring

The scoring uses the **Laguerre polynomial** linear programming approach from [Cohn and Gonçalves (2017)](https://arxiv.org/abs/1712.04438). Submit a list of at most **25** positive real numbers \`laguerre_double_roots\` — the prescribed double root positions. The server constructs the auxiliary test function $g$ as a linear combination of even-degree generalized Laguerre polynomials ($\\alpha = -1/2$, degrees $0, 2, \\ldots, 4k+2$) normalized so that $g(0)=0$, $g'(0)=1$, with double roots at each $z_i$. It then numerically evaluates $g(x) / (x \\prod_i (x - z_i)^2)$ at high precision, detects sign changes, refines them with root bracketing, and returns

$$S = \\frac{r}{2\\pi}$$

as the upper bound on $C$. **Lower $S$ is better.**

## Reference

Problem 6.11 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    laguerre_double_roots: "list of 1 to 25 positive reals (double root positions, each <= 300)",
  },
  zodSchema: z.object({
    laguerre_double_roots: z.array(z.number().positive().max(300)).min(1).max(25),
  }),
  verifier: `import json
import math
import mpmath as mp
import numpy as np
from scipy.optimize import brentq
from scipy.special import eval_genlaguerre

MP_DPS = 80
COND_MP_THRESHOLD = 1e15
GRID_POINTS = 200_000


def laguerre_prime_f64(n, alpha, x):
    if n == 0:
        return 0.0
    return float(-eval_genlaguerre(n - 1, alpha + 1, x))


def build_system_f64(zs):
    m = len(zs)
    alpha = -0.5
    degrees = np.arange(0, 4 * m + 4, 2, dtype=int)
    num_lps = len(degrees)
    num_conditions = 2 * m + 2
    a = np.zeros((num_conditions, num_lps), dtype=np.float64)
    for j, n in enumerate(degrees):
        a[0, j] = eval_genlaguerre(int(n), alpha, 0.0)
        a[1, j] = laguerre_prime_f64(int(n), alpha, 0.0)
    for i, z in enumerate(zs):
        for j, n in enumerate(degrees):
            a[2 * i + 2, j] = eval_genlaguerre(int(n), alpha, z)
            a[2 * i + 3, j] = laguerre_prime_f64(int(n), alpha, z)
    b = np.zeros(num_conditions, dtype=np.float64)
    b[1] = 1.0
    return degrees, alpha, a, b


def gen_laguerre_mp(n, a, x):
    return mp.binomial(n + a, n) * mp.hyp1f1(-n, a + 1, x)


def laguerre_prime_mp(n, a, x):
    if int(n) == 0:
        return mp.mpf(0)
    return -gen_laguerre_mp(int(n) - 1, a + 1, x)


def solve_coeffs_mp(zs, degrees):
    a_mp = mp.mpf("-0.5")
    num_lps = len(degrees)
    num_conditions = 2 * len(zs) + 2
    A = mp.matrix(num_conditions, num_lps)
    bvec = mp.matrix(num_conditions, 1)
    bvec[1, 0] = 1
    zero = mp.mpf(0)
    for j, n in enumerate(degrees):
        A[0, j] = gen_laguerre_mp(int(n), a_mp, zero)
        A[1, j] = laguerre_prime_mp(int(n), a_mp, zero)
    for i, z in enumerate(zs):
        zmp = mp.mpf(str(z))
        for j, n in enumerate(degrees):
            A[2 * i + 2, j] = gen_laguerre_mp(int(n), a_mp, zmp)
            A[2 * i + 3, j] = laguerre_prime_mp(int(n), a_mp, zmp)
    sol = mp.lu_solve(A, bvec)
    return np.array([float(sol[k, 0]) for k in range(num_lps)], dtype=np.float64)


def g_on_grid(xs, coeffs, degrees, alpha):
    out = np.zeros_like(xs, dtype=np.float64)
    for j, n in enumerate(degrees):
        out += coeffs[j] * eval_genlaguerre(int(n), alpha, xs)
    return out


def denom_on_grid(xs, zs):
    p = xs.copy()
    for z in zs:
        d = xs - z
        p *= d * d
    return p


def q_val(x, coeffs, degrees, alpha, zs):
    xs = np.array([x], dtype=np.float64)
    d = float(denom_on_grid(xs, zs)[0])
    if abs(d) < 1e-280:
        return float("nan")
    return float(g_on_grid(xs, coeffs, degrees, alpha)[0]) / d


def evaluate(solution: dict) -> float:
    zs = solution["laguerre_double_roots"]
    if len(zs) == 0:
        raise ValueError("laguerre_double_roots must be non-empty.")
    if len(zs) > 25:
        raise ValueError("At most 25 roots allowed.")
    if any(z <= 0 for z in zs):
        raise ValueError("All roots must be positive.")
    if any(z > 300 for z in zs):
        raise ValueError("All roots must be <= 300.")
    zs = [float(z) for z in zs]
    if len(set(zs)) != len(zs):
        raise ValueError("Duplicate double-root positions are not allowed.")

    degrees, alpha, a_f64, b_f64 = build_system_f64(zs)
    cond = float(np.linalg.cond(a_f64))
    if cond > COND_MP_THRESHOLD:
        mp.mp.dps = MP_DPS
        coeffs = solve_coeffs_mp(zs, degrees)
    else:
        coeffs = np.linalg.solve(a_f64, b_f64)

    xmax = float(max(zs)) * 1.5 + 100.0
    xs = np.linspace(1e-9, xmax, GRID_POINTS, dtype=np.float64)
    g = g_on_grid(xs, coeffs, degrees, alpha)
    d = denom_on_grid(xs, zs)
    qv = np.divide(g, d, out=np.full_like(g, np.nan), where=np.abs(d) > 1e-280)

    valid = np.isfinite(qv) & (np.abs(qv) < 1e280)
    for z in zs:
        valid &= np.abs(xs - z) > max(1e-6, abs(z) * 1e-9)

    signs = np.sign(qv)
    signs[~valid] = np.nan
    largest = None

    for k in range(len(xs) - 1):
        if not valid[k] or not valid[k + 1]:
            continue
        s0 = signs[k]
        s1 = signs[k + 1]
        if s0 == 0 or s1 == 0 or s0 == s1:
            continue
        a_lo = float(xs[k])
        b_hi = float(xs[k + 1])

        def f(t):
            return q_val(t, coeffs, degrees, alpha, zs)

        try:
            r = brentq(f, a_lo, b_hi, maxiter=200)
        except ValueError:
            continue
        if r > 0 and (largest is None or r > largest):
            largest = r

    if largest is None:
        raise ValueError("No numerical sign-changing roots found.")

    return float(largest / (2 * math.pi))`,
};

export default problem;
