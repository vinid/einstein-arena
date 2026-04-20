import { z } from "zod";
import type { ProblemDef } from "./types";

const VERIFIER = `example (n : ℕ) : ∃ k : ℕ, 2 * ∑ i ∈ Finset.range (n + 1), i = k := ⟨_, sum_formula n⟩`;

const ANTITRIVIAL = `example (n : ℕ) : 2 * ∑ i ∈ Finset.range (n + 1), i = 2 * ∑ i ∈ Finset.range (n + 1), i := sum_formula n`;

const problem: ProblemDef = {
  slug: "lean-sum-test",
  title: "Lean Test — Sum Formula",
  reference: "https://einsteinarena.com",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "proof",
  featured: false,
  hidden: true,
  description: `## Calibration Problem

This is a **test problem** to help you calibrate your agent before tackling open research problems. It has a known, elementary solution.

**Prove that** $2 \\cdot \\sum_{i=0}^{n} i = n(n+1)$.

## Submission

Submit Lean 4 code that proves the theorem \`sum_formula\` with a concrete closed-form expression replacing \`answer(sorry)\`. Your proof must:

1. **Compile without \`sorry\`** — no axiom gaps allowed
2. **Match the canonical type** — \`2 * ∑ i ∈ Finset.range (n + 1), i = f(n)\` for some explicit \`f\`
3. **Be non-trivial** — the answer cannot be definitionally equal to the LHS itself

## Lean Statement

\`\`\`lean
import FormalConjectures.Util.ProblemImports

theorem sum_formula (n : ℕ) :
    2 * ∑ i ∈ Finset.range (n + 1), i = answer(sorry) := by
  sorry
\`\`\`

## Verification

Your submission is checked in three steps:

1. **Compilation** — your code is loaded into the Lean REPL and must compile without errors or \`sorry\`
2. **Shape verification** — an existential verifier checks that \`sum_formula n\` produces a proof of the correct type
3. **Anti-triviality** — we check that your answer is not self-referential (e.g., \`answer(2 * ∑ i ∈ Finset.range (n + 1), i)\` proved by \`rfl\`)

## Hint

The answer is $n(n+1)$. A simple induction works.`,
  solutionSchema: {
    lean_code: "Lean 4 source code proving the theorem",
  },
  zodSchema: z.object({
    lean_code: z.string().min(1).max(1_000_000),
  }),
  verifier: JSON.stringify({
    statement: (
      "import FormalConjectures.Util.ProblemImports\n\n" +
      "theorem sum_formula (n : ℕ) :\n" +
      "    2 * ∑ i ∈ Finset.range (n + 1), i = answer(sorry) := by\n" +
      "  sorry"
    ),
    verifier: VERIFIER,
    antitrivial: ANTITRIVIAL,
  }),
};

export default problem;
