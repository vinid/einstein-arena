import { z } from "zod";
import type { ProblemDef } from "./types";

const LEAN_PREAMBLE = `import FormalConjectures.Util.ProblemImports
{{extra_imports}}

namespace Erdos3`;

const LEAN_TEMPLATE_YES = `${LEAN_PREAMBLE}

@[category research open, AMS 11]
theorem erdos_3 : ∀ A : Set ℕ,
    (¬ Summable fun a : A ↦ 1 / (a : ℝ)) →
    ∃ᶠ (k : ℕ) in Filter.atTop, ∃ S ⊆ A, S.IsAPOfLength k := by
{{proof}}`;

const LEAN_TEMPLATE_NO = `${LEAN_PREAMBLE}

@[category research open, AMS 11]
theorem erdos_3 : ¬ (∀ A : Set ℕ,
    (¬ Summable fun a : A ↦ 1 / (a : ℝ)) →
    ∃ᶠ (k : ℕ) in Filter.atTop, ∃ S ⊆ A, S.IsAPOfLength k) := by
{{proof}}`;

const LEAN_STATEMENT = `import FormalConjectures.Util.ProblemImports

namespace Erdos3

@[category research open, AMS 11]
theorem erdos_3 : answer(sorry) ↔ ∀ A : Set ℕ,
    (¬ Summable fun a : A ↦ 1 / (a : ℝ)) →
    ∃ᶠ (k : ℕ) in Filter.atTop, ∃ S ⊆ A, S.IsAPOfLength k := by
  sorry`;

const problem: ProblemDef = {
  slug: "erdos-3",
  title: "Erdős Problem 3 — Divergent Harmonic Sum and Arithmetic Progressions",
  reference: "https://www.erdosproblems.com/3",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "proof",
  proofKind: "claim_proof",
  featured: true,
  hidden: false,
  description: `## Problem

If $A \\subseteq \\mathbb{N}$ has

$$\\sum_{n \\in A} \\frac{1}{n} = \\infty,$$

must $A$ contain arbitrarily long arithmetic progressions?

This is [Erdős Problem #3](https://www.erdosproblems.com/3).

## Submission

Submit structured fields:
- \`claim\` — \`"yes"\` or \`"no"\`
- \`proof\` — a Lean proof body (after \`:= by\`)
- \`extra_imports\` — (optional) additional Mathlib imports

If you claim **yes**, you must prove the statement directly.
If you claim **no**, you must prove its negation.

## Verification

Your submission is checked in these steps:

1. **Import validation** — only Mathlib and FormalConjectures imports are allowed
2. **Compilation** — the generated module (with your claim and proof) is compiled
3. **Axiom audit** — the theorem is checked with \`#print axioms\`

## Reference

[Erdős Problem #3](https://www.erdosproblems.com/3).`,
  solutionSchema: {
    claim: '"yes" or "no"',
    proof: "Lean proof body (after := by)",
    extra_imports: "(optional) additional Mathlib imports",
  },
  zodSchema: z.object({
    claim: z.enum(["yes", "no"]),
    proof: z.string().min(1).max(800_000),
    extra_imports: z.array(z.string()).max(16).optional(),
  }),
  verifier: JSON.stringify({
    statement: LEAN_STATEMENT,
    verifier: `open Erdos3 in example :
  ∃ p : Prop,
    p ↔ ∀ A : Set ℕ,
      (¬ Summable fun a : A ↦ 1 / (a : ℝ)) →
      ∃ᶠ (k : ℕ) in Filter.atTop, ∃ S ⊆ A, S.IsAPOfLength k := ⟨_, erdos_3⟩`,
    antitrivial: `open Erdos3 in example :
  (∀ A : Set ℕ,
      (¬ Summable fun a : A ↦ 1 / (a : ℝ)) →
      ∃ᶠ (k : ℕ) in Filter.atTop, ∃ S ⊆ A, S.IsAPOfLength k) ↔
    (∀ A : Set ℕ,
      (¬ Summable fun a : A ↦ 1 / (a : ℝ)) →
      ∃ᶠ (k : ℕ) in Filter.atTop, ∃ S ⊆ A, S.IsAPOfLength k) := erdos_3`,
  }),

  leanTemplateYes: LEAN_TEMPLATE_YES,
  leanTemplateNo: LEAN_TEMPLATE_NO,
  theoremName: "Erdos3.erdos_3",
  allowedClaims: ["yes", "no"],
};

export default problem;
