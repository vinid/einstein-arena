import { z } from "zod";
import type { ProblemDef } from "./types";

const LEAN_PREAMBLE = `import FormalConjectures.Util.ProblemImports
{{extra_imports}}

namespace Erdos30

noncomputable abbrev h (N : ℕ) : ℕ := Finset.maxSidonSubsetCard (Finset.Icc 1 N)

open Filter`;

const LEAN_TEMPLATE_YES = `${LEAN_PREAMBLE}

@[category research open, AMS 11]
theorem erdos_30 :
    ∀ᵉ (ε > 0), (fun N => h N - (N : Real).sqrt) =O[atTop] fun N => (N : ℝ)^(ε : ℝ) := by
{{proof}}`;

const LEAN_TEMPLATE_NO = `${LEAN_PREAMBLE}

@[category research open, AMS 11]
theorem erdos_30 :
    ¬ (∀ᵉ (ε > 0), (fun N => h N - (N : Real).sqrt) =O[atTop] fun N => (N : ℝ)^(ε : ℝ)) := by
{{proof}}`;

const LEAN_STATEMENT = `import FormalConjectures.Util.ProblemImports

namespace Erdos30

noncomputable abbrev h (N : ℕ) : ℕ := Finset.maxSidonSubsetCard (Finset.Icc 1 N)

open Filter

@[category research open, AMS 11]
theorem erdos_30 : answer(sorry) ↔
    ∀ᵉ (ε > 0), (fun N => h N - (N : Real).sqrt) =O[atTop] fun N => (N : ℝ)^(ε : ℝ) := by
  sorry`;

const problem: ProblemDef = {
  slug: "erdos-30",
  title: "Erdős Problem 30 — Sidon Sets",
  reference: "https://www.erdosproblems.com/30",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "proof",
  proofKind: "claim_proof",
  featured: true,
  hidden: false,
  description: `## Problem

Let $h(N)$ be the maximum size of a Sidon set in $\\{1, \\dots, N\\}$. Is it true that, for every $\\varepsilon > 0$,

$$h(N) = N^{1/2} + O_\\varepsilon(N^\\varepsilon)?$$

This is [Erdős Problem #30](https://www.erdosproblems.com/30).

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

[Erdős Problem #30](https://www.erdosproblems.com/30).`,
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
    verifier: `open Filter Erdos30 in example :
  ∃ p : Prop,
    p ↔ ∀ᵉ (ε > 0), (fun N => h N - (N : Real).sqrt) =O[atTop] fun N => (N : ℝ)^(ε : ℝ) := ⟨_, erdos_30⟩`,
    antitrivial: `open Filter Erdos30 in example :
  (∀ᵉ (ε > 0), (fun N => h N - (N : Real).sqrt) =O[atTop] fun N => (N : ℝ)^(ε : ℝ)) ↔
    (∀ᵉ (ε > 0), (fun N => h N - (N : Real).sqrt) =O[atTop] fun N => (N : ℝ)^(ε : ℝ)) := erdos_30`,
  }),

  leanTemplateYes: LEAN_TEMPLATE_YES,
  leanTemplateNo: LEAN_TEMPLATE_NO,
  theoremName: "Erdos30.erdos_30",
  allowedClaims: ["yes", "no"],
};

export default problem;
