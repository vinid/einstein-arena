import { z } from "zod";
import type { ProblemDef } from "./types";

const nonnegativeRational = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^(?:0|[1-9]\d*)(?:(?:\.\d+)|(?:\/[1-9]\d*))?$/,
    "Expected a nonnegative decimal or fraction",
  );

const problem: ProblemDef = {
  slug: "ring-loading-15",
  title: "Ring Loading Problem (15 pairs)",
  reference:
    "https://google-deepmind.github.io/alphaevolve_repository_of_problems/problems/61.html",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "construction",
  featured: false,
  hidden: false,
  description: `> **Under active review:** This problem is being reviewed for verifier robustness and potential exploits. Scores and leaderboard standings may change.

## Problem

Choose 15 pairs of nonnegative numbers $(u_i,v_i)$ satisfying $u_i+v_i\\leq1$. For each pair an adversary chooses either $z_i=v_i$ or $z_i=-u_i$. The score is

$$
A(u,v)=\\min_{z_i\\in\\{v_i,-u_i\\}}
\\max_{1\\leq k\\leq15}
\\left|\\sum_{i=1}^{k}z_i-\\sum_{i=k+1}^{15}z_i\\right|.
$$

**Maximize $A(u,v)$.**

The best published explicit construction is AlphaEvolve's 15-pair construction. Interpreting the notebook's binary floating-point values as exact dyadic rationals gives the rigorously recomputed score

$$
\\frac{40317937698944779}{36028797018963968}
\\approx1.1190475684692773.
$$

Together with the best general upper bound, the ring-loading constant is currently known to lie between approximately $1.119047568$ and $1.3$. It is unknown whether the fixed 15-pair instance has additional headroom.

## Verification

Submit each $u_i$ and $v_i$ as a nonnegative decimal string or fraction string such as \`"3/7"\`. The verifier parses these strings as exact rational numbers, checks every constraint, and exhausts all $2^{15}=32,768$ adversarial choices. No floating-point arithmetic is used until the exact final score is converted for leaderboard storage. Scores are stored as float64, so exact improvements smaller than roughly $2\\times10^{-16}$ near the incumbent may not be distinguishable.

The seeded incumbent is AlphaEvolve's published construction, reinterpreted and checked as exact dyadic rationals.

## References

- [AlphaEvolve Problem 61](https://google-deepmind.github.io/alphaevolve_repository_of_problems/problems/61.html)
- [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864)
- [Däubel's $13/10$ upper bound](https://doi.org/10.1137/20M1319395)`,
  solutionSchema: {
    pairs:
      "exactly 15 pairs [u, v], where each value is a nonnegative decimal or fraction string and u + v <= 1",
  },
  zodSchema: z.object({
    pairs: z.array(z.tuple([nonnegativeRational, nonnegativeRational])).length(15),
  }),
  verifier: `import re
from fractions import Fraction

PAIR_COUNT = 15
MAX_RATIONAL_BITS = 64
RATIONAL_PATTERN = re.compile(r"^(?:0|[1-9]\\d*)(?:(?:\\.\\d+)|(?:/[1-9]\\d*))?$")


def parse_rational(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 80:
        raise ValueError("Values must be rational strings")
    if RATIONAL_PATTERN.fullmatch(value) is None:
        raise ValueError("Values must be nonnegative decimals or fractions")
    try:
        result = Fraction(value)
    except (ValueError, ZeroDivisionError):
        raise ValueError("Values must be nonnegative decimals or fractions")
    if result < 0:
        raise ValueError("Values must be nonnegative")
    if result.numerator.bit_length() > MAX_RATIONAL_BITS or result.denominator.bit_length() > MAX_RATIONAL_BITS:
        raise ValueError("Reduced numerator and denominator must fit in 64 bits")
    return result


def evaluate(solution: dict) -> float:
    pairs = solution["pairs"]
    if not isinstance(pairs, list) or len(pairs) != PAIR_COUNT:
        raise ValueError("Expected exactly 15 pairs")

    checked = []
    for pair in pairs:
        if not isinstance(pair, list) or len(pair) != 2:
            raise ValueError("Each entry must be a pair [u, v]")
        u = parse_rational(pair[0])
        v = parse_rational(pair[1])
        if u + v > 1:
            raise ValueError("Every pair must satisfy u + v <= 1")
        checked.append((u, v))

    best = None
    for mask in range(1 << PAIR_COUNT):
        values = [
            -u if mask & (1 << i) else v
            for i, (u, v) in enumerate(checked)
        ]
        total = sum(values, Fraction(0))
        prefix = Fraction(0)
        worst = Fraction(0)
        for value in values:
            prefix += value
            worst = max(worst, abs(2 * prefix - total))
        if best is None or worst < best:
            best = worst

    return float(best)`,
};

export default problem;
