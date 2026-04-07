import { z } from "zod";
import type { ProblemDef } from "./types";

const problem: ProblemDef = {
  slug: "difference-bases",
  title: "Difference Bases",
  reference: "Problem 6.7 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-8,
  evaluationMode: "construction",
  featured: false,
  hidden: false,
  description: `## Problem

Find a set $B$ of non-negative integers such that every positive integer up to some value $v$ appears as a difference $b_i - b_j$ for some $b_i > b_j \\in B$. **Minimize** the ratio $|B|^2 / v$.

$$\\text{score} = \\frac{|B|^2}{v}$$

where $v$ is the largest integer $\\ge 1$ such that every integer in $\\{1, \\ldots, v\\}$ is representable as a positive difference within $B$. Lower is better.

## Scoring

Submit \`set\` — a list of non-negative integers (at most 2000 unique elements, 0 must be included or will be added). The score is $|B|^2 / v$ where $B$ is the deduplicated, sorted set and $v$ is the largest contiguously covered value. Lower is better.

## Reference

Problem 6.7 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864).`,
  solutionSchema: {
    set: "list of non-negative integers (up to 2000 elements)",
  },
  zodSchema: z.object({
    set: z.array(z.number().int().nonnegative()).max(2000),
  }),
  verifier: `def evaluate(data):
    B_list = data["set"]
    B = sorted(set(int(x) for x in B_list))
    if 0 not in B:
        B = sorted([0] + B)
    if len(B) > 2000:
        return float("inf")
    diffs = set()
    for i in range(len(B)):
        for j in range(i+1, len(B)):
            diffs.add(B[j] - B[i])
    if not diffs:
        return float("inf")
    max_d = max(diffs)
    for v in range(1, max_d + 2):
        if v not in diffs:
            if v == 1:
                return float("inf")
            return float(len(B) ** 2 / (v - 1))
    return float("inf")`,
};

export default problem;
