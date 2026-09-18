import { z } from "zod";
import type { ProblemDef } from "./types";

const word = z.string().regex(/^[01]{16}$/);

const problem: ProblemDef = {
  slug: "two-deletion-code-16",
  title: "Two-Deletion-Correcting Code (length 16)",
  reference: "https://arxiv.org/abs/2505.23881",
  scoring: "maximize",
  minImprovement: 1,
  evaluationMode: "construction",
  featured: false,
  hidden: false,
  description: `> **Under active review:** This problem statement and verifier are being reviewed for mathematical correctness, verifier robustness, and potential exploits. Independently check the description and verifier rather than trusting them blindly. Scores and leaderboard standings may change.

## Problem

A binary code $C\\subseteq\\{0,1\\}^{16}$ corrects two deletions if no two distinct codewords can produce the same 14-bit word after deleting two positions.

For $x\\in\\{0,1\\}^{16}$, let

$$
D_2(x)=\\{\\text{length-14 subsequences obtained by deleting two positions from }x\\}.
$$

The requirement is

$$
D_2(x)\\cap D_2(y)=\\varnothing
\\qquad\\text{for all distinct }x,y\\in C.
$$

**Maximize $|C|$.**

Weindel and Heckel's April 2025 v1 reported a 204-word construction found by FunSearch. CPro1 published an exact 208-word code in May 2025. Their June 2026 v2 reports 200 words from their own search, 215 words found with KaMIS, and an LP upper bound of 487. The authors' DistributedFunSearch repository contains neither the exact 215-word construction nor the corresponding length-16, two-deletion conflict graph; CPro1 contains the exact 208-word construction. Therefore, 208 is the strongest public baseline artifact we could independently reproduce.

As of September 15, 2026, a valid 216-word submission would improve the best publicly reported lower bound. Scores from 209 through 215 improve the reproducible leaderboard baseline but do not surpass the reported record.

Deletion-correcting codes are used for synchronization errors, including channels motivated by DNA data storage.

## Verification

Submit distinct 16-character binary strings. For each word, the verifier generates all $\\binom{16}{2}=120$ two-position deletions, deduplicates equal descendants from that word, and checks that no descendant has appeared for another codeword.

The check uses exact strings and hash-set membership. There is no floating-point arithmetic, sampling, or auxiliary certificate. Since every codeword has at least one descendant among the $2^{14}$ possible received words, $|C|\\leq2^{14}$; this gives the submission cap.

The baseline is CPro1's published 208-word construction, reproduced from its result file at commit \`5b26b1a5ca0625a857cf6c2adcc6668e1d66a2ac\`.

## References

- [Rosin, “Using Reasoning Models to Generate Search Heuristics that Solve Open Instances of Combinatorial Design Problems”](https://arxiv.org/abs/2505.23881)
- [CPro1 source and result files](https://github.com/Constructive-Codes/CPro1)
- [Weindel and Heckel, “LLM-Guided Search for Deletion-Correcting Codes”](https://arxiv.org/abs/2504.00613)
- [DistributedFunSearch source repository](https://github.com/MLI-lab/DistributedFunSearch)
- [Peer-review discussion and paper](https://openreview.net/forum?id=Tyqty7Wa8k)`,
  solutionSchema: {
    words:
      "list of 1 to 16384 distinct strings, each containing exactly 16 binary digits",
  },
  zodSchema: z.object({
    words: z
      .array(word)
      .min(1)
      .max(16_384)
      .refine((words) => new Set(words).size === words.length, {
        message: "Codewords must be distinct",
      }),
  }),
  verifier: `WORD_LENGTH = 16
MAX_WORDS = 1 << 14


def descendants(word):
    result = set()
    for i in range(WORD_LENGTH - 1):
        for j in range(i + 1, WORD_LENGTH):
            result.add(word[:i] + word[i + 1:j] + word[j + 1:])
    return result


def evaluate(solution: dict) -> float:
    words = solution["words"]
    if not isinstance(words, list) or not 1 <= len(words) <= MAX_WORDS:
        raise ValueError("Expected between 1 and 16384 codewords")

    checked = set()
    used_descendants = set()
    for word in words:
        if (
            not isinstance(word, str)
            or len(word) != WORD_LENGTH
            or any(bit not in "01" for bit in word)
        ):
            raise ValueError("Every codeword must contain exactly 16 binary digits")
        if word in checked:
            raise ValueError("Codewords must be distinct")
        checked.add(word)

        current_descendants = descendants(word)
        if not used_descendants.isdisjoint(current_descendants):
            raise ValueError("Two codewords share a two-deletion descendant")
        used_descendants.update(current_descendants)

    return float(len(words))`,
};

export default problem;
