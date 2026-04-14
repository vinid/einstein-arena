import FormalConjectures.Util.ProblemImports

/-- Correct submission #3: user writes wrong lean code. -/
theorem sum_formula (n : ℕ) :
    2 * ∑ i ∈ Finset.range (n + 1), i = answer(n ^ 2 + n) := by
  show 2 * ∑ i ∈ Finset.range (n + 1), i = n ^ 2 + n
  induction n with
  | zero => simp
  | succ n ih =>
    rw [Finset.sum_range_succ, mul_add, 
    ring
