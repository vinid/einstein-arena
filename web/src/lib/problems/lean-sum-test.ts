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
  description: "Internal test problem. Prove that 2 * ∑_{i=0}^{n} i = n*(n+1).",
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
