import { z } from "zod";
import type { ProblemDef } from "./types";

const problem: ProblemDef = {
  slug: "uncertainty-principle",
  title: "Uncertainty Principle (Upper Bound)",
  reference: "Problem 6.11 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-5,
  evaluationMode: "construction",
  featured: true,
  description: `## Problem

Let $C$ be the largest constant for which

$$A(f)\\,A(\\hat{f}) \\geq C$$

for all even $f$ with $f(0), \\hat{f}(0) < 0$. **Establish an upper bound for $C$ that is as strong as possible.**

## Scoring

The scoring uses the **Laguerre polynomial** linear programming approach from [Cohn and Gonçalves (2017)](https://arxiv.org/abs/1712.04438). Submit a list of $k$ positive real numbers \`laguerre_double_roots\` — the prescribed double root positions. The server constructs the auxiliary test function $g$ as a linear combination of even-degree generalized Laguerre polynomials ($\\alpha = -1/2$, degrees $0, 2, \\ldots, 4k+2$) normalized so that $g(0)=0$, $g'(0)=1$, with double roots at each $z_i$. It then finds the largest sign change $r$ of $g(x) / (x \\prod_i (x - z_i)^2)$ and returns

$$S = \\frac{r}{2\\pi}$$

as the upper bound on $C$. **Lower $S$ is better.**

## Reference

Problem 6.11 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)`,
  solutionSchema: {
    laguerre_double_roots: "list of k positive reals (double root positions)",
  },
  zodSchema: z.object({
    laguerre_double_roots: z.array(z.number().positive()).min(1).max(50),
  }),
  verifier: `import sys
if hasattr(sys, "set_int_max_str_digits"):
    sys.set_int_max_str_digits(0)

import math
from itertools import groupby

import sympy


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

    # Exact rationals from the decimal the user typed (not from the float's
    # binary expansion). This avoids 17-digit denominators in sympy.
    zs_rat = [sympy.Rational(repr(float(z))) for z in zs]
    if len(set(zs_rat)) != len(zs_rat):
        raise ValueError("Duplicate double-root positions are not allowed.")

    x = sympy.symbols("x")
    g_fn = _find_laguerre_combination(zs_rat, x)

    div = sympy.prod([(x - zi) ** 2 for zi in zs_rat]) * x
    gq_fn = sympy.exquo(g_fn, div)

    # The Cohn-Gonçalves upper bound r/(2*pi) for the "f(0), f_hat(0) < 0"
    # variant (this problem) is valid only when g is eventually non-positive
    # on (0, inf). By construction gq(0) = g'(0) / prod(z_i^2) > 0, so the
    # bound is valid exactly when the leading coefficient of gq is negative
    # (then g flips to <= 0 after its largest sign change and stays there).
    gq_poly = sympy.Poly(gq_fn, x)
    if gq_poly.LC() >= 0:
        raise ValueError(
            "Invalid construction: g is not eventually non-positive on "
            "(0, inf), so the Cohn-Gonçalves upper bound does not apply "
            "to this choice of double roots."
        )

    # Sign changes of g (equivalently, of gq) on (0, inf) correspond to
    # real roots of gq with odd multiplicity. sympy.real_roots already
    # returns roots repeated by multiplicity and sorted, so grouping is
    # enough; no numerical sign-check is needed.
    real_roots = sympy.real_roots(gq_fn, x)
    if not real_roots:
        raise ValueError("g has no sign changes on (0, inf).")

    largest_sign_change = None
    for root, group in groupby(real_roots):
        mult = sum(1 for _ in group)
        if mult % 2 == 1:
            r_val = float(root.evalf(30))
            if r_val > 0 and (largest_sign_change is None or r_val > largest_sign_change):
                largest_sign_change = r_val

    if largest_sign_change is None:
        raise ValueError("No sign-changing roots on (0, inf).")

    return largest_sign_change / (2 * math.pi)


def _find_laguerre_combination(zs_rat, x):
    m = len(zs_rat)
    alpha = sympy.Rational(-1, 2)
    degrees = list(range(0, 4 * m + 4, 2))
    lps = [
        sympy.polys.orthopolys.laguerre_poly(n=i, x=x, alpha=alpha, polys=False)
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
        zi = zs_rat[i]
        for j in range(num_lps):
            mat[2 * i + 2, j] = lps[j].subs(x, zi)
            mat[2 * i + 3, j] = lps[j].diff(x).subs(x, zi)

    coeffs = mat.LUsolve(b)
    return sum(coeffs[i] * lps[i] for i in range(num_lps))`,
};

export default problem;
