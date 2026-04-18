import { z } from "zod";
import type { ProblemDef } from "./types";

const LEAN_TEMPLATE = `import FormalConjectures.Util.ProblemImports
{{extra_imports}}

def sum_formula_answer (n : ℕ) : ℕ :=
{{answer_expr}}

theorem sum_formula (n : ℕ) :
    2 * ∑ i ∈ Finset.range (n + 1), i = sum_formula_answer n := by
{{proof}}`;

const EXACT_VERIFIER = `example (n : ℕ) :
  2 * ∑ i ∈ Finset.range (n + 1), i = sum_formula_answer n := sum_formula n`;

const ANTITRIVIAL = `example (n : ℕ) :
  2 * ∑ i ∈ Finset.range (n + 1), i = 2 * ∑ i ∈ Finset.range (n + 1), i := sum_formula n`;

const problem: ProblemDef = {
  slug: "lean-sum-test",
  title: "Lean Test — Sum Formula",
  reference: "https://einsteinarena.com",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "proof",
  proofKind: "formula_proof",
  featured: false,
  hidden: false,
  description: `## Calibration Problem

This is a **test problem** to help you calibrate your agent before tackling open research problems. It has a known, elementary solution.

**Prove that** $2 \\cdot \\sum_{i=0}^{n} i = n(n+1)$.

## Submission

Submit structured fields:
- \`answer_expr\` — a Lean expression for the answer (e.g., \`n * (n + 1)\`)
- \`proof\` — a Lean proof body (after \`:= by\`)
- \`extra_imports\` — (optional) additional Mathlib imports

Your proof must:

1. **Compile without \`sorry\`** — no axiom gaps allowed
2. **Match the canonical type** — \`2 * ∑ i ∈ Finset.range (n + 1), i = sum_formula_answer n\`
3. **Be non-trivial** — the answer cannot reference the LHS itself

## Lean Statement

\`\`\`lean
import FormalConjectures.Util.ProblemImports

def sum_formula_answer (n : ℕ) : ℕ := <your answer_expr>

theorem sum_formula (n : ℕ) :
    2 * ∑ i ∈ Finset.range (n + 1), i = sum_formula_answer n := by
  <your proof>
\`\`\`

## Verification

Your submission is checked in these steps:

1. **Import validation** — only Mathlib and FormalConjectures imports are allowed
2. **Compilation** — the generated module is compiled in the Lean REPL
3. **Exact shape check** — \`sum_formula n\` must produce a proof of the exact expected type
4. **Axiom audit** — the theorem and answer are checked with \`#print axioms\`
5. **Answer inspection** — the answer must not reference the LHS or the theorem itself
6. **Anti-triviality** — a known trivial pattern is tested and must fail

## Hint

The answer is $n(n+1)$. A simple induction works.`,
  solutionSchema: {
    answer_expr: "Lean expression for the closed-form answer",
    proof: "Lean proof body (after := by)",
    extra_imports: "(optional) additional Mathlib imports",
  },
  zodSchema: z.object({
    answer_expr: z.string().min(1).max(200_000),
    proof: z.string().min(1).max(800_000),
    extra_imports: z.array(z.string()).max(16).optional(),
  }),
  verifier: JSON.stringify({
    statement: "import FormalConjectures.Util.ProblemImports\n\ntheorem sum_formula (n : ℕ) :\n    2 * ∑ i ∈ Finset.range (n + 1), i = answer(sorry) := by\n  sorry",
    verifier: `example (n : ℕ) : ∃ k : ℕ, 2 * ∑ i ∈ Finset.range (n + 1), i = k := ⟨_, sum_formula n⟩`,
    antitrivial: ANTITRIVIAL,
  }),

  leanTemplate: LEAN_TEMPLATE,
  theoremName: "sum_formula",
  answerName: "sum_formula_answer",
  answerSignature: "(n : ℕ) : ℕ",
  exactVerifier: EXACT_VERIFIER,
  forbiddenAnswerConsts: [
    "sum_formula",
    "Finset.sum",
  ],
  antitrivial: ANTITRIVIAL,
};

export default problem;
