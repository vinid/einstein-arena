import FormalConjectures.Util.ProblemImports

/-- Correct submission #2: user writes the answer as n²+n instead of n*(n+1).
    Algebraically identical, but a different Lean expression. Both are valid. -/
theorem sum_formula (n : ℕ) :
    2 * ∑ i ∈ Finset.range (n + 1), i = answer(n ^ 2 + n) := by
  show 2 * ∑ i ∈ Finset.range (n + 1), i = n ^ 2 + n
  induction n with
  | zero => simp
  | succ n ih =>
    rw [Finset.sum_range_succ, mul_add, ih]
    ring
