import { z } from "zod";
import type { ProblemDef } from "./types";

const problem: ProblemDef = {
  slug: "kakeya-needle-128",
  title: "Discretized Kakeya Needle (n = 128)",
  reference: "Problem 6.9 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-9,
  evaluationMode: "construction",
  featured: false,
  hidden: true,
  description: `## Problem

For $j = 1, \\ldots, 128$ choose a real horizontal offset $x_j$ and define the triangle

$$T_j(x_j) = \\operatorname{conv}\\left\\{ (x_j, 0),\\ \\left(x_j + \\tfrac{1}{128}, 0\\right),\\ \\left(x_j + \\tfrac{j}{128}, 1\\right) \\right\\}.$$

**Minimize** the area of the union

$$C_T(128) = \\left| \\bigcup_{j=1}^{128} T_j(x_j) \\right|.$$

This is the finite Kakeya needle problem.

**The state of the art is $C_T(128) \\le 0.107067$, established by the Station in August 2026**, improving HorizonMath's $0.109148$ and AlphaEvolve's $0.114810$. That is the number to beat.

The leaderboard is seeded with the classical Keich-style bitwise construction, which scores $0.119207$ under this verifier.

## Scoring

Submit \`offsets\` — exactly **128 base-10 decimal strings**, at most **25 fractional digits** each. Strings are used rather than JSON numbers so that every offset is read as an exact rational with no binary rounding.

The verifier subtracts $x_1$ from every offset, which leaves the union area unchanged, and then computes the **exact** area:

At height $y \\in [0,1]$ the horizontal section of $T_j$ is

$$\\left[\\, x_j + \\tfrac{j}{128}y,\\quad x_j + \\tfrac{1}{128} + \\tfrac{j-1}{128}y \\,\\right],$$

so both endpoints are affine in $y$ with rational coefficients. The verifier finds every rational height where two endpoints cross, sorts them exactly, and integrates the union length — which is affine between consecutive crossings — slab by slab in exact rational arithmetic.

There is no grid, no rasterization, no Monte Carlo sampling and no floating-point polygon library. The area is computed as an exact rational and converted to a float only as the final step. Lower is better.

## Reference

Problem 6.9 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864), and Section 4.4 of [The Station](https://arxiv.org/abs/2608.23691).`,
  solutionSchema: {
    offsets: "list of exactly 128 base-10 decimal strings (max 25 fractional digits)",
  },
  zodSchema: z.object({
    offsets: z.array(z.string()).length(128),
  }),
  verifier: `import math
from fractions import Fraction

N = 128
MAX_FRAC_DIGITS = 25
MAX_INT_DIGITS = 4


def _parse_offset(s):
    if not isinstance(s, str):
        raise ValueError("Each offset must be a base-10 decimal string.")
    t = s.strip()
    neg = t.startswith("-")
    if neg or t.startswith("+"):
        t = t[1:]
    if t.count(".") > 1:
        raise ValueError("Malformed decimal string: " + repr(s))
    intpart, _, fracpart = t.partition(".")
    digits = intpart + fracpart
    if digits == "" or not digits.isdigit():
        raise ValueError("Malformed decimal string: " + repr(s))
    if len(fracpart) > MAX_FRAC_DIGITS:
        raise ValueError("Offset has more than " + str(MAX_FRAC_DIGITS) + " fractional digits: " + repr(s))
    if len(intpart) > MAX_INT_DIGITS:
        raise ValueError("Offset integer part is too large: " + repr(s))
    val = Fraction(int(digits), 10 ** len(fracpart))
    return -val if neg else val


def _union_numer(p, q, consts, slopes):
    # Scaled union length at y = p/q, as an integer numerator over q.
    iv = []
    for k in range(0, len(consts), 2):
        iv.append((consts[k] * q + slopes[k] * p,
                   consts[k + 1] * q + slopes[k + 1] * p))
    iv.sort()
    total = 0
    cur_l, cur_r = iv[0]
    for l, r in iv[1:]:
        if l > cur_r:
            total += cur_r - cur_l
            cur_l, cur_r = l, r
        elif r > cur_r:
            cur_r = r
    total += cur_r - cur_l
    return total


def evaluate(data):
    offsets = data["offsets"]
    if len(offsets) != N:
        raise ValueError("Expected exactly " + str(N) + " offsets, got " + str(len(offsets)))

    xs = [_parse_offset(s) for s in offsets]
    # A common horizontal translation does not change the union area.
    x0 = xs[0]
    xs = [x - x0 for x in xs]

    # Put every offset over a single denominator Q, then scale all horizontal
    # coordinates by 128*Q so both section endpoints become affine functions
    # of y with integer coefficients.
    Q = 1
    for x in xs:
        Q = Q // math.gcd(Q, x.denominator) * x.denominator
    X = [int(x * Q) for x in xs]

    consts = []
    slopes = []
    for j in range(1, N + 1):
        consts.append(128 * X[j - 1])
        slopes.append(Q * j)
        consts.append(128 * X[j - 1] + Q)
        slopes.append(Q * (j - 1))

    # Every height in (0,1) at which two endpoint lines cross. The union
    # length is affine between consecutive crossings.
    ev = set()
    m = len(consts)
    for a in range(m):
        ca = consts[a]
        sa = slopes[a]
        for b in range(a + 1, m):
            ds = sa - slopes[b]
            if ds == 0:
                continue
            p = consts[b] - ca
            q = ds
            if q < 0:
                p = -p
                q = -q
            if 0 < p < q:
                g = math.gcd(p, q)
                ev.add((p // g, q // g))

    heights = sorted(ev, key=lambda t: Fraction(t[0], t[1]))
    heights.append((1, 1))

    scale = 128 * Q
    prev_y = Fraction(0)
    prev_u = Fraction(_union_numer(0, 1, consts, slopes), scale)
    total = Fraction(0)
    for p, q in heights:
        y = Fraction(p, q)
        u = Fraction(_union_numer(p, q, consts, slopes), q * scale)
        # Exact: the integrand is affine across the slab.
        total += (prev_u + u) * (y - prev_y) / 2
        prev_y = y
        prev_u = u

    return float(total)`,
};

export default problem;
