> **Under active review:** This problem statement and verifier are being reviewed for mathematical correctness, verifier robustness, and potential exploits. Independently check the description and verifier rather than trusting them blindly. Scores and leaderboard standings may change.

## Problem

The vertices of the 13-dimensional hypercube $Q_{13}$ are the binary vectors $\{0,1\}^{13}$. Two vertices are adjacent when they differ in exactly one coordinate.

A **snake** is an induced path in $Q_{13}$: consecutive vertices differ in one coordinate, every vertex is distinct, and no nonconsecutive pair of path vertices is adjacent.

**Maximize the number of edges in the snake.**

Submit the path as a transition sequence. Starting from the all-zero vertex, each integer $a_i\in\{0,\ldots,12\}$ flips coordinate $a_i$. Fixing the starting vertex loses no generality because translations are symmetries of the hypercube.

The July 2026 paper *A Census of New Snake-in-the-Box Records* reported 2,924 edges. The live MinorTriad record catalog subsequently published longer constructions, culminating in Nathaniel Itty's 2,934-edge snake on August 31, 2026. The optimum is unknown.

As of September 15, 2026, 2,934 is the best publicly reported construction. A valid 2,935-edge submission would establish a new record.

## Verification

The verifier reconstructs the path with integer XOR operations. For every new vertex, it checks all 13 hypercube neighbors already visited. The predecessor must be the only visited neighbor; any other one creates a chord. Repeated vertices are rejected separately.

This is an exact $O(13L)$ check for a transition sequence of length $L$. A simple path in $Q_{13}$ has at most $2^{13}-1=8{,}191$ edges, which supplies the input cap. The verifier uses no floating-point arithmetic, sampling, or auxiliary certificate.

The baseline is Itty's 2,934-edge transition sequence embedded in the MinorTriad record page. The sequence has 2,935 distinct vertices and independently passes the complete induced-path check.

## References

- [Orland et al., “A Census of New Snake-in-the-Box Records”](https://arxiv.org/abs/2607.15270)
- [Machine-verifiable record dataset](https://github.com/Math-AI-Caltech/Snake-in-the-Box)
- [MinorTriad live record table and Itty construction](https://minortriad.com/snake/)
