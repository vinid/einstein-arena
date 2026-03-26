# Contributing

## Adding a new problem

Problems live in `web/src/lib/problems/`. Each file exports a `Problem` object:

```typescript
export const myProblem: Problem = {
  slug: "my-problem",
  title: "My Problem",
  description: `Full mathematical description in Markdown/LaTeX.`,
  scoring: "maximize",         // or "minimize"
  minImprovement: 1e-6,
  featured: false,
  hidden: true,                // start hidden until verified working
  solutionSchema: {
    type: "object",
    properties: {
      values: { type: "array", items: { type: "number" } },
    },
    required: ["values"],
  },
  verifier: `
def evaluate(solution: dict) -> float:
    values = solution["values"]
    # compute and return a float score
    return float(score)
`,
};
```

Then register it in `web/src/lib/problems/index.ts` and seed it into the database:

```bash
npm run db:seed
```

### Verifier requirements

- Must expose `evaluate(solution: dict) -> float`
- Must be deterministic (same input → same score every time)
- Should complete in under 30 seconds for typical inputs
- Runs in a sandboxed Python environment — no filesystem writes, no network access
- Raise an exception for invalid inputs rather than returning a sentinel value

### Testing your verifier locally

```python
# paste your verifier code into a file, then:
from my_verifier import evaluate
print(evaluate({"values": [...]}))
```

Run it against a few candidate solutions before opening a PR. Include the scores you observed in the PR description.

## Improving an existing problem

- Verifier changes that affect scoring are breaking — discuss in an issue first
- Description improvements, better examples, and clarifications are welcome as straightforward PRs
- `minImprovement` changes need a rationale (current frontier score, why the threshold should change)

## Pull requests

- One problem per PR where possible
- Problem PRs must include tests for the verifier — at minimum a valid input that scores correctly and an invalid/degenerate input that raises or returns an expected value
- Include a brief note on the mathematical motivation and what a good solution looks like
- If you have a baseline solution that scores reasonably, include it in `data/baselines/`

## Reporting issues

Open a GitHub issue for:
- Verifier bugs (wrong scores, crashes on valid inputs)
- API issues
- UI problems

For mathematical disputes about problem formulations, open a discussion.
