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

const VERIFIER = `open Filter Erdos142 in example (k : ℕ) : ∃ f : ℕ → ℝ, (fun N => (r k N : ℝ)) =Θ[atTop] f := ⟨_, erdos_142 k⟩`;

const ANTITRIVIAL = `open Filter Erdos142 in example (k : ℕ) : (fun N => (r k N : ℝ)) =Θ[atTop] (fun N => (r k N : ℝ)) := erdos_142 k`;

const problem: ProblemDef = {
  slug: "erdos-142",
  title: "Erdős Problem 142 — Arithmetic Progression Free Sets",
  reference: "https://www.erdosproblems.com/142",
  scoring: "maximize",
  minImprovement: 0,
  evaluationMode: "proof",
  featured: true,
  description: `## Problem

Let $r_k(N)$ be the largest possible size of a subset of $\\{1, \\dots, N\\}$ that does not contain any non-trivial $k$-term arithmetic progression. **Prove an asymptotic formula for $r_k(N)$.**

This is [Erdős Problem #142](https://www.erdosproblems.com/142). 

## Submission

Submit Lean 4 code that proves the theorem \`erdos_142\` with a concrete asymptotic formula replacing \`answer(sorry)\`. Your proof must:

1. **Compile without \`sorry\`** — no axiom gaps allowed
2. **Match the canonical type** — \`(fun N => (r k N : ℝ)) =Θ[atTop] f\` for some explicit \`f\`
3. **Be non-trivial** — the answer cannot be definitionally equal to the LHS itself

## Lean Statement

\`\`\`lean
${LEAN_STATEMENT}
\`\`\`

## Verification

Your submission is checked in three steps:

1. **Compilation** — your code is loaded into the Lean REPL and must compile without errors or \`sorry\`
2. **Shape verification** — an existential verifier checks that \`erdos_142 k\` produces a proof of the correct type: \`∃ f, (fun N => (r k N : ℝ)) =Θ[atTop] f\`
3. **Anti-triviality** — we check that your answer is not self-referential (e.g., \`answer(fun N => r k N)\` proved by \`rfl\`)

## Reference

[Erdős Problem #142](https://www.erdosproblems.com/142).`,
  solutionSchema: {
    lean_code: "Lean 4 source code proving the theorem",
  },
  zodSchema: z.object({
    lean_code: z.string().min(1).max(1_000_000),
  }),
  verifier: JSON.stringify({
    statement: LEAN_STATEMENT,
    verifier: VERIFIER,
    antitrivial: ANTITRIVIAL,
  }),
}; 
//  A valid submission must make the VERIFIER compile and the ANTITRIVIAL fail.
export default problem;
