"""
Shannon Capacity of C_7
=======================

The Shannon capacity of a graph G is defined as:

    Theta(G) = sup_{n >= 1}  alpha(G^{boxtimes n})^{1/n}

where alpha(H) is the independence number of H, and G^{boxtimes n} is
the n-fold strong product of G with itself.

C_7 is the cycle graph on 7 vertices (vertices 0..6, edges i~j iff
|i-j| mod 7 == 1).

Two vertices x, y in C_7^{boxtimes n} are adjacent iff in EVERY coordinate
i they are equal OR adjacent in C_7:
    x ~_{C_7^n} y  iff  for all i: x_i == y_i OR |x_i - y_i| mod 7 == 1

An *independent set* in C_7^{boxtimes n} is a set S of n-tuples from {0..6}
such that no two elements are adjacent in the strong product.

Note: non-adjacency means there EXISTS a coordinate i where x_i != y_i AND
|x_i - y_i| mod 7 != 1 (i.e., they differ by 2, 3 in {1,...,6}).

Goal: **maximize |S|^{1/n}** over all submitted (n, S) pairs.

World record
------------
  - Polak-Schrijver (2018): found indep. set of size 367 in C_7^{boxtimes 5}
      => Theta(C_7) >= 367^{1/5} ~ 3.2578
  - Upper bound: Lovász theta: Theta(C_7) <= theta(C_7) ~ 3.3177

Beating 367^{1/5} ~ 3.2578 is a new world record.

Submission format
-----------------
{
  "n": 5,                      # exponent (integer, 1 <= n <= 7)
  "vectors": [[v0_0,...,v0_{n-1}], ...]   # ints in {0,...,6}
}

Score: |S|^{1/n} (float, maximize).
"""

import time
import itertools
import numpy as np


# Adjacency in C_7: i~j iff the cyclic distance is 1 (i.e. (i-j)%7==1 or (j-i)%7==1)
# This correctly includes the wrap-around edge (0, 6).
_C7_ADJ = {(i, j) for i in range(7) for j in range(7) if (i - j) % 7 == 1 or (j - i) % 7 == 1}


def _c7_strong_adjacent(x: tuple, y: tuple) -> bool:
    """True if x and y are adjacent in C_7^{boxtimes n} (strong product)."""
    # Adjacent iff in EVERY coordinate they are equal or adjacent in C_7
    for xi, yi in zip(x, y):
        if xi != yi and (xi, yi) not in _C7_ADJ:
            return False
    return True


def evaluate(data: dict) -> float:
    n = int(data["n"])
    vectors = data["vectors"]

    assert 1 <= n <= 7, f"n must be between 1 and 7, got {n}"
    assert len(vectors) > 0, "vectors must be non-empty"

    for v in vectors:
        assert len(v) == n, f"Each vector must have length {n}, got {len(v)}"
        for c in v:
            assert 0 <= c <= 6, f"Coordinates must be in {{0,...,6}}, got {c}"

    # Deduplicate
    S = list({tuple(v) for v in vectors})

    # Check independence: no two elements may be adjacent in C_7^n
    for i in range(len(S)):
        for j in range(i + 1, len(S)):
            if _c7_strong_adjacent(S[i], S[j]):
                raise AssertionError(
                    f"Elements {S[i]} and {S[j]} are adjacent in C_7^{n}"
                )

    return float(len(S)) ** (1.0 / n)


# ---------------------------------------------------------------------------
# Baseline constructions
# ---------------------------------------------------------------------------

def _independent_set_c7_n1() -> list[tuple]:
    """Max independent set in C_7 (the graph itself): size 3."""
    # C_7 has independence number 3: e.g. {0, 2, 4}
    return [(0,), (2,), (4,)]


def _independent_set_c7_n2() -> list[tuple]:
    """Independent set in C_7^2 via exhaustive search."""
    verts = list(itertools.product(range(7), repeat=2))
    best = []
    S: list[tuple] = []
    S_set: set[tuple] = set()
    for v in verts:
        ok = all(not _c7_strong_adjacent(v, s) for s in S)
        if ok:
            S.append(v)
            S_set.add(v)
    return S


def _polak_schrijver_n5() -> list[tuple]:
    """
    Polak-Schrijver (2018) independent set of size 367 in C_7^5.
    The actual construction uses a specific algebraic structure.
    We reproduce the *size* (367) as a reference target and time
    a synthetic valid set for verifier benchmarking.
    """
    # We cannot reproduce the exact 367-element set without the paper's
    # explicit list, so we build the best independent set we can greedily
    # and report both the greedy result and the known record.
    rng = np.random.default_rng(42)
    n = 5
    all_verts = list(itertools.product(range(7), repeat=n))
    order = np.arange(len(all_verts))
    rng.shuffle(order)
    S: list[tuple] = []
    S_adj: set[tuple] = set()  # vertices adjacent to something in S
    for idx in order:
        v = all_verts[idx]
        if v not in S_adj:
            # add v, mark all its neighbors as forbidden
            S.append(v)
            for u in all_verts:
                if _c7_strong_adjacent(v, u):
                    S_adj.add(u)
    return S


if __name__ == "__main__":
    print("=" * 60)
    print("Shannon Capacity of C_7  —  baseline reproduction")
    print("=" * 60)

    # --- n=1: max independent set in C_7 ---
    t0 = time.perf_counter()
    s1 = _independent_set_c7_n1()
    score1 = evaluate({"n": 1, "vectors": [list(v) for v in s1]})
    t1 = time.perf_counter()
    print(f"\nn=1:  |S|=3,  score=3^(1/1) = {score1:.4f}  (verify: {(t1-t0)*1000:.2f} ms)")

    # --- n=2 ---
    t0 = time.perf_counter()
    s2 = _independent_set_c7_n2()
    t_build = time.perf_counter() - t0
    t0 = time.perf_counter()
    score2 = evaluate({"n": 2, "vectors": [list(v) for v in s2]})
    t_verify = time.perf_counter() - t0
    print(f"n=2:  |S|={len(s2)},  score={score2:.4f}  (build: {t_build*1000:.0f} ms, verify: {t_verify*1000:.1f} ms)")

    # --- n=5: greedy ---
    print("\nBuilding greedy independent set in C_7^5 (this takes a moment)...")
    t0 = time.perf_counter()
    s5 = _polak_schrijver_n5()
    t_build = time.perf_counter() - t0
    t0 = time.perf_counter()
    score5 = evaluate({"n": 5, "vectors": [list(v) for v in s5]})
    t_verify = time.perf_counter() - t0
    print(f"n=5:  |S|={len(s5)},  score={score5:.4f}  (build: {t_build*1000:.0f} ms, verify: {t_verify*1000:.1f} ms)")

    # --- Records ---
    print("\n" + "-" * 60)
    print("Known lower bounds on Theta(C_7):")
    print(f"  Trivial (n=1):              3.0000   alpha(C_7) = 3")
    print(f"  BMRRST (1971):  343^(1/5) = {343**(1/5):.4f}")
    print(f"  VZ (2002):      108^(1/4) = {108**(1/4):.4f}")
    print(f"  MO (2017):      350^(1/5) = {350**(1/5):.4f}")
    print(f"  PS (2018):      367^(1/5) = {367**(1/5):.4f}   (world record — beat this)")
    print(f"Upper bound (Lovász theta):   {3.3177:.4f}")
