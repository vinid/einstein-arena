import { z } from "zod";
import type { ProblemDef } from "./types";

const LEAN_STATEMENT = `import FormalConjectures.Util.ProblemImports

open Filter

namespace Erdos142

noncomputable abbrev r := Set.IsAPOfLengthFree.maxCard

/--
Prove an asymptotic formula for $r_k(N)$, the largest possible size of a subset
of $\\{1, \\dots, N\\}$ that does not contain any non-trivial $k$-term arithmetic progression.
-/
@[category research open, AMS 11]
theorem erdos_142 (k : ℕ) : (fun N => (r k N : ℝ)) =Θ[atTop] (answer(sorry) : ℕ → ℝ) := by
  sorry`;

const LEAN_TEMPLATE = `import FormalConjectures.Util.ProblemImports
{{extra_imports}}

open Filter

namespace Erdos142

noncomputable abbrev r := Set.IsAPOfLengthFree.maxCard

noncomputable def erdos_142_answer (k : ℕ) : ℕ → ℝ :=
{{answer_expr}}

@[category research open, AMS 11]
theorem erdos_142 (k : ℕ) :
    (fun N => (r k N : ℝ)) =Θ[atTop] erdos_142_answer k := by
{{proof}}`;

const EXACT_VERIFIER = `open Filter Erdos142 in
example (k : ℕ) :
  (fun N => (r k N : ℝ)) =Θ[atTop] erdos_142_answer k := erdos_142 k`;

const ANTITRIVIAL = `open Filter Erdos142 in
example (k : ℕ) :
  (fun N => (r k N : ℝ)) =Θ[atTop] (fun N => (r k N : ℝ)) := erdos_142 k`;

const problem: ProblemDef = {
  slug: "erdos-142",
  title: "Erdős Problem 142 — Arithmetic Progression Free Sets",
  reference: "https://www.erdosproblems.com/142",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "proof",
  proofKind: "formula_proof",
  featured: true,
  hidden: true,
  description: `## Problem

Let $r_k(N)$ be the largest possible size of a subset of $\\{1, \\dots, N\\}$ that does not contain any non-trivial $k$-term arithmetic progression. **Prove an asymptotic formula for $r_k(N)$.**

This is [Erdős Problem #142](https://www.erdosproblems.com/142). 

## Submission

Submit structured fields:
- \`answer_expr\` — a Lean expression for the asymptotic formula (type: \`ℕ → ℝ\`)
- \`proof\` — a Lean proof body (after \`:= by\`)
- \`extra_imports\` — (optional) additional Mathlib imports

Your proof must:

1. **Compile without \`sorry\`** — no axiom gaps allowed
2. **Match the canonical type** — \`(fun N => (r k N : ℝ)) =Θ[atTop] erdos_142_answer k\`
3. **Pass axiom audit** — only standard axioms (propext, Classical.choice, Quot.sound) allowed
4. **Be non-circular** — the answer must not reference \`r\`, \`Set.IsAPOfLengthFree.maxCard\`, or the theorem itself

## Lean Statement

\`\`\`lean
import FormalConjectures.Util.ProblemImports

open Filter
namespace Erdos142

noncomputable abbrev r := Set.IsAPOfLengthFree.maxCard

noncomputable def erdos_142_answer (k : ℕ) : ℕ → ℝ := <your answer_expr>

theorem erdos_142 (k : ℕ) :
    (fun N => (r k N : ℝ)) =Θ[atTop] erdos_142_answer k := by
  <your proof>
\`\`\`

## Verification

Your submission is checked in these steps:

1. **Import validation** — only Mathlib and FormalConjectures imports are allowed
2. **Compilation** — the generated module is compiled in the Lean REPL
3. **Exact shape check** — \`erdos_142 k\` must produce a proof targeting the named answer
4. **Axiom audit** — theorem and answer are checked with \`#print axioms\`
5. **Answer inspection** — the answer must not reference forbidden constants
6. **Anti-triviality** — a known trivial self-reference pattern is tested and must fail

## Reference

[Erdős Problem #142](https://www.erdosproblems.com/142).`,
  solutionSchema: {
    answer_expr: "Lean expression for the asymptotic formula (ℕ → ℝ)",
    proof: "Lean proof body (after := by)",
    extra_imports: "(optional) additional Mathlib imports",
  },
  zodSchema: z.object({
    answer_expr: z.string().min(1).max(200_000),
    proof: z.string().min(1).max(800_000),
    extra_imports: z.array(z.string()).max(16).optional(),
  }),
  verifier: JSON.stringify({
    statement: LEAN_STATEMENT,
    verifier: `open Filter Erdos142 in example (k : ℕ) : ∃ f : ℕ → ℝ, (fun N => (r k N : ℝ)) =Θ[atTop] f := ⟨_, erdos_142 k⟩`,
    antitrivial: ANTITRIVIAL,
  }),

  leanTemplate: LEAN_TEMPLATE,
  theoremName: "Erdos142.erdos_142",
  answerName: "Erdos142.erdos_142_answer",
  answerSignature: "(k : ℕ) : ℕ → ℝ",
  exactVerifier: EXACT_VERIFIER,
  forbiddenAnswerConsts: [
    "Set.IsAPOfLengthFree.maxCard",
    "Erdos142.r",
    "Erdos142.erdos_142",
  ],
  antitrivial: ANTITRIVIAL,
};

export default problem;
