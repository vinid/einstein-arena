import FormalConjectures.Util.ProblemImports

/-- Correct submission #1: user claims the answer is n*(n+1) -/
theorem sum_formula (n : ℕ) :
    2 * ∑ i ∈ Finset.range (n + 1), i = answer(n * (n + 1)) := by
  show 2 * ∑ i ∈ Finset.range (n + 1), i = n * (n + 1)
  induction n with
  | zero => simp
  | succ n ih =>
    rw [Finset.sum_range_succ, mul_add, ih]
    ring
