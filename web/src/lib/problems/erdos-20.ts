import { z } from "zod";
import type { ProblemDef } from "./types";

const LEAN_PREAMBLE = `import FormalConjectures.Util.ProblemImports
{{extra_imports}}

universe u

namespace Erdos20

variable {α : Type}

def IsSunflowerWithKernel (F : Set (Set α)) (S : Set α) : Prop :=
    F.Pairwise (fun A B => A ∩ B = S)

def IsSunflower (F : Set (Set α)) : Prop := ∃ S, IsSunflowerWithKernel F S

noncomputable def f (n k : ℕ) : ℕ :=
    sInf {m | ∀ {α : Type}, ∀ (F : Set (Set α)),
      ((∀ f ∈ F, f.ncard = n) ∧ m ≤ F.ncard) → ∃ S ⊆ F, S.ncard = k ∧ IsSunflower S}`;

const LEAN_TEMPLATE_YES = `${LEAN_PREAMBLE}

@[category research open, AMS 5]
theorem erdos_20 : ∃ (c : ℕ → ℕ), ∀ n k, n > 0 → f n k < (c k) ^ n := by
{{proof}}`;

const LEAN_TEMPLATE_NO = `${LEAN_PREAMBLE}

@[category research open, AMS 5]
theorem erdos_20 : ¬ ∃ (c : ℕ → ℕ), ∀ n k, n > 0 → f n k < (c k) ^ n := by
{{proof}}`;

const LEAN_STATEMENT = `import FormalConjectures.Util.ProblemImports

universe u

namespace Erdos20

variable {α : Type}

def IsSunflowerWithKernel (F : Set (Set α)) (S : Set α) : Prop :=
    F.Pairwise (fun A B => A ∩ B = S)

def IsSunflower (F : Set (Set α)) : Prop := ∃ S, IsSunflowerWithKernel F S

noncomputable def f (n k : ℕ) : ℕ :=
    sInf {m | ∀ {α : Type}, ∀ (F : Set (Set α)),
      ((∀ f ∈ F, f.ncard = n) ∧ m ≤ F.ncard) → ∃ S ⊆ F, S.ncard = k ∧ IsSunflower S}

@[category research open, AMS 5]
theorem erdos_20 : answer(sorry) ↔ ∃ (c : ℕ → ℕ), ∀ n k, n > 0 → f n k < (c k) ^ n := by
  sorry`;

const problem: ProblemDef = {
  slug: "erdos-20",
  title: "Erdős Problem 20 — Sunflower Bounds",
  reference: "https://www.erdosproblems.com/20",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "proof",
  proofKind: "claim_proof",
  featured: true,
  hidden: false,
  description: `## Problem

Let $f(n,k)$ be minimal such that every family $\\mathcal{F}$ of $n$-uniform sets with $|\\mathcal{F}| \\ge f(n,k)$ contains a $k$-sunflower. Must there exist a constant $c_k > 0$ such that

$$f(n,k) < c_k^n$$

for all $n > 0$?

This is [Erdős Problem #20](https://www.erdosproblems.com/20).

## Submission

Submit structured fields:
- \`claim\` — \`"yes"\` or \`"no"\`
- \`proof\` — a Lean proof body (after \`:= by\`)
- \`extra_imports\` — (optional) additional Mathlib imports

If you claim **yes**, you must prove: \`∃ (c : ℕ → ℕ), ∀ n k, n > 0 → f n k < (c k) ^ n\`
If you claim **no**, you must prove: \`¬ ∃ (c : ℕ → ℕ), ∀ n k, n > 0 → f n k < (c k) ^ n\`

## Verification

Your submission is checked in these steps:

1. **Import validation** — only Mathlib and FormalConjectures imports are allowed
2. **Compilation** — the generated module (with your claim and proof) is compiled
3. **Axiom audit** — the theorem is checked with \`#print axioms\`

## Reference

[Erdős Problem #20](https://www.erdosproblems.com/20).`,
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
    verifier: `open Erdos20 in example :
  ∃ p : Prop,
    p ↔ ∃ (c : ℕ → ℕ), ∀ n k, n > 0 → f n k < (c k) ^ n := ⟨_, erdos_20⟩`,
    antitrivial: `open Erdos20 in example :
  (∃ (c : ℕ → ℕ), ∀ n k, n > 0 → f n k < (c k) ^ n) ↔
    (∃ (c : ℕ → ℕ), ∀ n k, n > 0 → f n k < (c k) ^ n) := erdos_20`,
  }),

  leanTemplateYes: LEAN_TEMPLATE_YES,
  leanTemplateNo: LEAN_TEMPLATE_NO,
  theoremName: "Erdos20.erdos_20",
  allowedClaims: ["yes", "no"],
};

export default problem;
