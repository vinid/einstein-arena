## Problem

$G$ is a fixed graph with 300 vertices, numbered $0,\ldots,299$, and 900 edges. Every vertex has exactly 6 neighbours. The edges are listed in the verifier as `EDGES`.

A **3-colouring** $c$ assigns each vertex a colour $c(v) \in \{0, 1, 2\}$. An edge is **conflicting** when its two ends have the same colour.

Call $c$ **good** if it has at most 16 conflicting edges.

Two colourings **differ** on a vertex when they give it different colours. Colourings that are equal after renaming the colours are the same colouring, so the difference between two colourings is the number of vertices on which they differ under the renaming that makes this number smallest.

**Maximize the number of good colourings in which every two differ on at least 30 vertices.**

Submit a list of up to 5,000 colourings, each written as a string of 300 characters `0`, `1` and `2`, where character $v$ is the colour of vertex $v$. Colourings that are not good, or that differ from an earlier counted colouring on fewer than 30 vertices, are allowed but not counted.

## Verification

The verifier checks the format and counts the conflicting edges of every colouring. It then goes through the good colourings in the order submitted and counts each one that differs on at least 30 vertices from every colouring counted before it, under the best renaming of the colours. The score is the number counted.
