import { z } from "zod";
import type { ProblemDef } from "./types";

const point = z.tuple([
  z.number().int().min(0).max(74),
  z.number().int().min(0).max(74),
]);

const problem: ProblemDef = {
  slug: "no-three-in-line-75",
  title: "No-Three-in-Line (75 × 75 grid)",
  reference: "https://wwwhomes.uni-bielefeld.de/achim/no3in/readme.html",
  scoring: "maximize",
  minImprovement: 1,
  evaluationMode: "construction",
  featured: false,
  hidden: false,
  description: `> **Under active review:** This problem statement and verifier are being reviewed for mathematical correctness, verifier robustness, and potential exploits. Independently check the description and verifier rather than trusting them blindly. Scores and leaderboard standings may change.

## Problem

Choose as many distinct points as possible from the $75\\times75$ integer grid

$$
\\{0,1,\\ldots,74\\}^2
$$

such that no three chosen points lie on one straight line. Lines of every slope count, not only rows, columns, and diagonals.

**Maximize the number of points.**

Every row contains at most two chosen points, so the elementary upper bound is

$$D(75)\\leq150.$$

As of September 2026, 150-point configurations are known for every grid size through 76 except 75. A 148-point construction follows by embedding Thomas Prellberg's published $74\\times74$ configuration into this grid. No public 149-point construction was found in the sources below.

A valid 149-point submission improves the public lower bound for this instance. A valid 150-point submission proves $D(75)=150$ and closes the only missing case through 76. This would settle one finite instance, not the asymptotic no-three-in-line problem.

## Verification

Submit between 1 and 150 distinct integer coordinate pairs. For every triple, the verifier checks the exact integer identity

$$
(x_2-x_1)(y_3-y_1)-(y_2-y_1)(x_3-x_1)\\neq0.
$$

The verifier uses no floating-point arithmetic, tolerances, random sampling, or auxiliary certificates. At the 150-point cap it checks exactly $\\binom{150}{3}=551{,}300$ triples.

The baseline is Prellberg's 148-point $74\\times74$ construction embedded unchanged in the $75\\times75$ grid.

## References

- [Achim Flammenkamp's no-three-in-line database](https://wwwhomes.uni-bielefeld.de/achim/no3in/readme.html)
- [No-Three-in-a-Line Problem, MathWorld](https://mathworld.wolfram.com/No-Three-in-a-LineProblem.html)
- [Prellberg's 74-grid construction](http://wwwhomes.uni-bielefeld.de/achim/no3in/download/configurations/n74_rot4.few)`,
  solutionSchema: {
    points:
      "list of 1 to 150 distinct integer pairs [x, y], where 0 <= x, y <= 74",
  },
  zodSchema: z.object({
    points: z
      .array(point)
      .min(1)
      .max(150)
      .refine(
        (points) =>
          new Set(points.map(([x, y]) => `${x},${y}`)).size === points.length,
        "Points must be distinct",
      ),
  }),
  verifier: `MAX_POINTS = 150
GRID_MAX = 74


def evaluate(solution: dict) -> float:
    points = solution["points"]
    if not isinstance(points, list) or not 1 <= len(points) <= MAX_POINTS:
        raise ValueError("Expected between 1 and 150 points")

    checked = []
    for point in points:
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError("Every point must be an [x, y] pair")
        x, y = point
        if (
            isinstance(x, bool)
            or isinstance(y, bool)
            or not isinstance(x, int)
            or not isinstance(y, int)
        ):
            raise ValueError("Coordinates must be integers")
        if not 0 <= x <= GRID_MAX or not 0 <= y <= GRID_MAX:
            raise ValueError("Coordinates must lie in [0, 74]")
        checked.append((x, y))

    if len(set(checked)) != len(checked):
        raise ValueError("Points must be distinct")

    for i in range(len(checked) - 2):
        x1, y1 = checked[i]
        for j in range(i + 1, len(checked) - 1):
            x2, y2 = checked[j]
            dx = x2 - x1
            dy = y2 - y1
            for k in range(j + 1, len(checked)):
                x3, y3 = checked[k]
                if dx * (y3 - y1) - dy * (x3 - x1) == 0:
                    raise ValueError("Three points are collinear")

    return float(len(checked))`,
};

export default problem;
