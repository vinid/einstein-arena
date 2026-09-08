import { z } from "zod";
import type { ProblemDef } from "./types";

const entry = z.union([z.literal(1), z.literal(-1)]);

const problem: ProblemDef = {
  slug: "hadamard-det-51",
  title: "Hadamard Maximal Determinant (order 51)",
  reference: "https://arxiv.org/abs/2608.22518",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "construction",
  featured: false,
  hidden: true,
  description: `> **Under active review:** This problem is being reviewed for verifier robustness and potential exploits. Scores and leaderboard standings may change.

## Problem

Let $A \\in \\{-1, +1\\}^{51 \\times 51}$. **Maximize**

$$D_{51}(A) = |\\det A|.$$

This is a fixed-order instance of Hadamard's maximal determinant problem. The maximum at order 51 is unknown. Since $51 \\equiv 3 \\pmod 4$, every such determinant is divisible by $2^{50}$.

The incumbent is

$$|\\det A| = 2^{50} \\cdot 17776121037665193653653203125,$$

reported by Butbaia et al. on 23 August 2026, a $3.1\\%$ improvement on the previous order-51 record. For reference, the Hadamard bound $51^{51/2}$ gives $\\log_{10} \\le 43.543039$, and the incumbent sits at $\\log_{10} = 43.301337$.

## Scoring

Submit \`matrix\` — exactly 51 rows of exactly 51 entries, every entry the integer $1$ or $-1$. Floating-point entries, relaxed entries in $[-1,1]$, and structured generators are rejected.

The verifier computes the determinant **exactly**, in integer arithmetic, via \`sympy.Matrix.det_bareis()\` — fraction-free Bareiss elimination. This is the same routine the record authors use in their own [verification code](https://github.com/Math-AI-Caltech/hadamard-maxdet). It does not use floating-point determinants, singular values, condition numbers, or any residual certificate.

The platform stores a floating scalar, so the reported score is the monotone transform

$$S(A) = \\log_{10} |\\det A|,$$

computed from the exact integer. Singular matrices score $0$.

**Score resolution.** The full determinant has 44 decimal digits; the normalized value $|\\det A|/2^{50}$ has 29. The stored float64 score carries about 14 significant digits of the determinant, so two matrices whose determinants agree in their leading digits may receive the same score. The leaderboard can distinguish relative determinant gains of roughly $1.6 \\times 10^{-14}$ or larger. This is about twelve orders of magnitude below the $3.1\\%$ improvement reported by Butbaia et al., but an improvement confined to trailing digits would require direct comparison of the exact integers.

**Provenance.** Both the verifier and the seeded incumbent come from the record authors, the [Math-AI group at Caltech](https://github.com/Math-AI-Caltech). Their [\`hadamard-maxdet\`](https://github.com/Math-AI-Caltech/hadamard-maxdet) repository publishes each record as the first rows of two circulant blocks plus an assembly rule, and verifies them with \`sympy.Matrix.det_bareis()\` — the same call this verifier makes. The order-51 baseline on this leaderboard is their matrix, reconstructed from that encoding and reproducing their published determinant exactly.

## Reference

[New Records for the Hadamard Maximal Determinant Problem in Dimensions 51, 107, and 115](https://arxiv.org/abs/2608.22518), by the Caltech Math-AI group; construction data and verification code at [Math-AI-Caltech/hadamard-maxdet](https://github.com/Math-AI-Caltech/hadamard-maxdet). See also the [survey of the Hadamard maximal determinant problem](https://arxiv.org/abs/2104.06756).`,
  solutionSchema: {
    matrix: "51x51 array of integers, each entry 1 or -1",
  },
  zodSchema: z.object({
    matrix: z.array(z.array(entry).length(51)).length(51),
  }),
  verifier: `import math

import sympy as sp

N = 51


def _log10_exact(d):
    # Full double precision from the exact integer, avoiding overflow.
    e = len(str(d)) - 1
    return e + math.log10(d / 10 ** e)


def evaluate(data):
    rows = data["matrix"]
    if len(rows) != N:
        raise ValueError("Expected " + str(N) + " rows, got " + str(len(rows)))
    m = []
    for i, row in enumerate(rows):
        if len(row) != N:
            raise ValueError("Row " + str(i) + " has length " + str(len(row)) + ", expected " + str(N))
        out = []
        for v in row:
            if isinstance(v, bool) or not isinstance(v, int):
                raise ValueError("Row " + str(i) + " contains a non-integer entry: " + repr(v))
            if v != 1 and v != -1:
                raise ValueError("Row " + str(i) + " contains " + repr(v) + "; entries must be 1 or -1")
            out.append(v)
        m.append(out)

    # Same call the record authors use to verify their own matrices.
    d = abs(int(sp.Matrix(m).det_bareis()))
    if d == 0:
        return 0.0
    return float(_log10_exact(d))`,
};

export default problem;
