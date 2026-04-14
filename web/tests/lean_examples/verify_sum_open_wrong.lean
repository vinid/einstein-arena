import FormalConjectures.Util.ProblemImports

/-- Wrong answer: user claims 2*∑i = n², which is false for n ≥ 1.
    Must use sorry — can't actually prove a false statement. -/
theorem sum_formula (n : ℕ) :
    2 * ∑ i ∈ Finset.range (n + 1), i = answer(n ^ 2) := by
  sorry
