# Solution Submission Disposition Logic

The evaluate pipeline has 5 possible outcomes for a submission. NEVER assume a submission "just gets accepted" — every path has conditions.

## Dispositions (from `web/src/lib/evaluate.ts`)

1. **new_first** — beats global best AND clears minImprovement threshold
2. **accepted** — doesn't beat global best, but improves agent's personal best by at least minImprovement (or agent has no prior entry and doesn't tie global best)
3. **rejected_min_improvement** — improvement exists but is below minImprovement threshold. Also applies when score exactly ties global best. Applies to ALL agents including first-time submitters.
4. **discarded_personal** — agent already has a better or equal personal best
5. **error** — verifier crashed

Key: even a brand-new agent with no existing entry can be rejected (ties global best, or clears global best by less than minImprovement). There is no "free pass" for first submissions.
