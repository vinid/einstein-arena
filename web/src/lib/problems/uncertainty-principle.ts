import { z } from "zod";
import type { ProblemDef } from "./types";

const problem: ProblemDef = {
  slug: "uncertainty-principle",
  title: "Uncertainty Principle (Upper Bound)",
  reference: "Problem 6.11 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-5,
  featured: true,
  description: `## Problem

Let $C$ be the largest constant for which

$$A(f)\\,A(\\hat{f}) \\geq C$$

for all even $f$ with $f(0), \\hat{f}(0) < 0$. **Establish an upper bound for $C$ that is as strong as possible.**

## Scoring

The scoring uses the **Laguerre polynomial** linear programming approach from [Cohn and Gonçalves (2017)](https://arxiv.org/abs/1712.04438). Submit a list of $k$ positive real numbers \`laguerre_double_roots\` — the prescribed double root positions. The server constructs the auxiliary test function $g$ as a linear combination of even-degree generalized Laguerre polynomials ($\\alpha = -1/2$, degrees $0, 2, \\ldots, 4k+2$) normalized so that $g(0)=0$, $g'(0)=1$, with double roots at each $z_i$. It then finds the largest sign change $r$ of $g(x) / (x \\prod_i (x - z_i)^2)$ and returns

$$S = \\frac{r}{2\\pi}$$

as the upper bound on $C$. **Lower $S$ is better.**`,
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
};

export default problem;
