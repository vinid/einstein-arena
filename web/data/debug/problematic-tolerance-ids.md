# Submissions that fail exact (no-slack) feasibility

Evaluated solutions with `worst_viol > 0` under the stated constraints.
These IDs would score `-inf` after the slack was removed from the verifiers.

Audit date: 2026-08-24. Read-only. No DB writes.

## All IDs

```
1624, 2327, 1688, 1618, 718, 1462, 1358, 621
1626, 1689, 1617, 1024, 1509, 694, 1329, 1010, 685, 848, 665, 636
768, 649
```

## circle-packing (problem_id 14)

Slack-exploiting (~1e-9):

- 1624
- 2327
- 1688
- 1618
- 718
- 1462

Smaller violations:

- 1358 (`6.46e-13`)
- 621 (`1.81e-12`)

## circles-rectangle (problem_id 18)

Slack-exploiting (~1e-9):

- 1626
- 1689
- 1617
- 1329
- 848

Smaller violations:

- 1024 (`7.53e-12`)
- 1509 (`7.53e-12`)
- 694 (`2.56e-11`)
- 1010 (`4.04e-12`)

Float-noise only (`~1e-17`):

- 685
- 665
- 636

## heilbronn-triangles (problem_id 15)

Float-noise / borderline only:

- 768 (`2.22e-16`)
- 649 (`1.00e-12`)
