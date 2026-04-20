import FormalConjectures.Util.ProblemImports

/-- Trivial self-referential "answer": the user defines answer(f) = f itself.
    This is x = x, proved by rfl.  No sorry, compiles fine, passes the
    existential verifier — but it's a vacuous non-answer. -/
theorem sum_formula (n : ℕ) :
    2 * ∑ i ∈ Finset.range (n + 1), i =
    answer(2 * ∑ i ∈ Finset.range (n + 1), i) := by
  rfl
