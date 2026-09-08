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
  description: `> **Under active review:** This problem is being reviewed for verifier robustness and potential exploits. Scores and leaderboard standings may change.

## Problem

For $j = 1, \\ldots, 128$ choose a real horizontal offset $x_j$ and define the triangle

$$T_j(x_j) = \\operatorname{conv}\\left\\{ (x_j, 0),\\ \\left(x_j + \\tfrac{1}{128}, 0\\right),\\ \\left(x_j + \\tfrac{j}{128}, 1\\right) \\right\\}.$$

**Minimize** the area of the union

$$C_T(128) = \\left| \\bigcup_{j=1}^{128} T_j(x_j) \\right|.$$

This is the finite Kakeya needle problem.

**The state of the art is $C_T(128) \\le 0.107067$, established by the Station in August 2026.** That is the number to beat.

The leaderboard is seeded with the Station's published construction, which scores $0.10706663656163481$ under this verifier.

## Scoring

Submit \`offsets\` — exactly **128 base-10 decimal strings**, at most **25 fractional digits** each. Strings are used rather than JSON numbers so that every offset is read as an exact rational with no binary rounding.

The verifier subtracts $x_1$ from every offset, which leaves the union area unchanged, and then computes the **exact** area:

At height $y \\in [0,1]$ the horizontal section of $T_j$ is

$$\\left[\\, x_j + \\tfrac{j}{128}y,\\quad x_j + \\tfrac{1}{128} + \\tfrac{j-1}{128}y \\,\\right],$$

so both endpoints are affine in $y$ with rational coefficients. The verifier finds every rational height where two endpoints cross, sorts them exactly, and integrates the union length — which is affine between consecutive crossings — slab by slab in exact rational arithmetic.

There is no grid, no rasterization, no Monte Carlo sampling and no floating-point polygon library. The area is computed as an exact rational and converted to a float only as the final step. Lower is better.

**Provenance.** The verifier follows the structure of the Kakeya needle evaluator in [the Station](https://arxiv.org/abs/2608.23691) — the same endpoint lines, the same breakpoint set, and the same slabwise integration — with two changes. All arithmetic is exact rational rather than float64, and the Station's \`BREAKPOINT_EPS = 1e-12\` slab-skipping tolerance is set to zero, so no slab is ever dropped. On honest constructions the two implementations agree to machine precision; removing the tolerance closes a path by which a submission could shave area off its own score.

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


def _triangle_endpoint_lines(scaled_xs, den):
    # The two section endpoints of T_j are affine in y. Each is stored as
    # (slope, intercept), both scaled by N*den so they are exact integers.
    lines = []
    for index, x in enumerate(scaled_xs, start=1):
        intercept = N * x
        lines.append((den * index, intercept))
        lines.append((den * (index - 1), intercept + den))
    return lines


def _collect_breakpoints(lines):
    # Every height in (0,1) where two endpoint lines cross, as an exact
    # rational p/q in lowest terms. No epsilon: nothing is merged or dropped.
    pts = set()
    m = len(lines)
    for a in range(m):
        slope_a, intercept_a = lines[a]
        for b in range(a + 1, m):
            slope_delta = slope_a - lines[b][0]
            if slope_delta == 0:
                continue
            p = lines[b][1] - intercept_a
            q = slope_delta
            if q < 0:
                p = -p
                q = -q
            if 0 < p < q:
                g = math.gcd(p, q)
                pts.add((p // g, q // g))
    out = sorted(pts, key=lambda t: Fraction(t[0], t[1]))
    out.append((1, 1))
    return out


def _union_interval_length(intervals):
    intervals.sort()
    total = 0
    cur_l, cur_r = intervals[0]
    for left, right in intervals[1:]:
        if left > cur_r:
            total += cur_r - cur_l
            cur_l, cur_r = left, right
        elif right > cur_r:
            cur_r = right
    total += cur_r - cur_l
    return total


def _union_length_at_y(lines, p, q):
    # Union length at y = p/q, returned as an integer numerator over q*N*den.
    intervals = []
    for k in range(0, len(lines), 2):
        slope_l, intercept_l = lines[k]
        slope_r, intercept_r = lines[k + 1]
        intervals.append((intercept_l * q + slope_l * p,
                          intercept_r * q + slope_r * p))
    return _union_interval_length(intervals)


def triangle_union_area(xs):
    # Put every offset over one denominator so all coordinates are integers.
    den = 1
    for x in xs:
        den = den // math.gcd(den, x.denominator) * x.denominator
    scaled_xs = [int(x * den) for x in xs]

    lines = _triangle_endpoint_lines(scaled_xs, den)
    scale = N * den

    total = Fraction(0)
    prev_y = Fraction(0)
    prev_u = Fraction(_union_length_at_y(lines, 0, 1), scale)
    for p, q in _collect_breakpoints(lines):
        y = Fraction(p, q)
        u = Fraction(_union_length_at_y(lines, p, q), q * scale)
        # Exact: the union length is affine across each slab.
        total += (prev_u + u) * (y - prev_y) / 2
        prev_y = y
        prev_u = u
    return total


def evaluate(data):
    offsets = data["offsets"]
    if len(offsets) != N:
        raise ValueError("Expected exactly " + str(N) + " offsets, got " + str(len(offsets)))

    xs = [_parse_offset(s) for s in offsets]
    # A common horizontal translation does not change the union area.
    x0 = xs[0]
    xs = [x - x0 for x in xs]

    area = triangle_union_area(xs)

    # The union cannot exceed the total area of the 128 triangles.
    if area <= 0 or area > Fraction(1, 2):
        raise ValueError("Internal area check failed: " + str(float(area)))
    return float(area)`,
};

export default problem;
