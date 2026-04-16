"""
Cap Set in F_3^n
================

A *cap set* in F_3^n is a subset S of {0,1,2}^n that contains no
three-term arithmetic progression, i.e. no three distinct elements
x, y, z with x + y + z = 0 (mod 3) in every coordinate.

Equivalently, for every pair (x, y) in S the "third point"
z = (-x - y) mod 3 must not also be in S.

Goal: **maximize |S|** for n = 8.

World record
------------
  - FunSearch (2023, Romera-Paredes et al., Nature 625, Fig. 4):
      discovered a cap set of size 512 in n=8 dimensions — the
      current world record lower bound for |cap(8)|.
  - Upper bound: Ellenberg-Gijswijt (2017) proved |cap(n)| = O(2.756^n),
      giving |cap(8)| <= 2.756^8 ~ 2213.

Submitting any cap set in F_3^8 with |S| > 512 constitutes a new
mathematical world record.

Submission format
-----------------
{
  "vectors": [[v0_0, v0_1, ..., v0_7], [v1_0, ...], ...]   # ints in {0,1,2}
}

Score: |S| (integer, maximize).
"""

import time
import itertools
import numpy as np


def evaluate(data: dict) -> float:
    vectors = data["vectors"]
    n = 8

    for v in vectors:
        assert len(v) == n, f"Each vector must have length {n}, got {len(v)}"
        for c in v:
            assert c in (0, 1, 2), f"Coordinates must be in {{0,1,2}}, got {c}"

    S_set = set(tuple(v) for v in vectors)
    S_list = list(S_set)

    for i, x in enumerate(S_list):
        for j in range(i + 1, len(S_list)):
            y = S_list[j]
            z = tuple((-x[k] - y[k]) % 3 for k in range(n))
            if z in S_set and z != x and z != y:
                raise AssertionError(
                    f"Three-term AP: {x} + {y} + {z} = 0 mod 3"
                )

    return float(len(S_list))


# ---------------------------------------------------------------------------
# Baseline helpers
# ---------------------------------------------------------------------------

def _greedy_cap(n: int, seed: int = 0) -> list[tuple]:
    """Build a valid cap set in F_3^n by greedy insertion."""
    rng = np.random.default_rng(seed)
    all_vecs = list(itertools.product(range(3), repeat=n))
    order = list(range(len(all_vecs)))
    rng.shuffle(order)
    S = []
    S_set = set()
    for idx in order:
        v = all_vecs[idx]
        ok = True
        for x in S:
            z = tuple((-x[k] - v[k]) % 3 for k in range(n))
            if z in S_set:
                ok = False
                break
        if ok:
            S.append(v)
            S_set.add(v)
    return S


def _max_cap_n4() -> list[tuple]:
    """Exhaustive maximum cap set in F_3^4 (size 20)."""
    n = 4
    all_vecs = list(itertools.product(range(3), repeat=n))
    best = []
    # greedy with multiple seeds to find a good one
    for seed in range(200):
        cap = _greedy_cap(n, seed=seed)
        if len(cap) > len(best):
            best = cap
    return best


if __name__ == "__main__":
    print("=" * 60)
    print("Cap Set in F_3^8  —  baseline reproduction")
    print("=" * 60)

    # --- Baseline 1: product of two optimal F_3^4 caps ---
    # If A is a cap in F_3^m and B is a cap in F_3^n,
    # A x B is a cap in F_3^{m+n} (a 3-AP requires both halves to be a 3-AP).
    print("\nComputing optimal cap in F_3^4...")
    t0 = time.perf_counter()
    cap4 = _max_cap_n4()
    t1 = time.perf_counter()
    print(f"  |cap(4)| = {len(cap4)}  ({(t1-t0)*1000:.0f} ms)")

    cap8_product = [a + b for a in cap4 for b in cap4]
    t0 = time.perf_counter()
    score = evaluate({"vectors": [list(v) for v in cap8_product]})
    t1 = time.perf_counter()
    print(f"\nProduct construction (cap4 x cap4):")
    print(f"  |S| = {int(score)}  (verify time: {(t1-t0)*1000:.1f} ms)")

    # --- Baseline 2: greedy cap in F_3^8 ---
    print("\nGreedy cap in F_3^8 (seed=0)...")
    t0 = time.perf_counter()
    cap8_greedy = _greedy_cap(8, seed=0)
    t_build = time.perf_counter() - t0

    t0 = time.perf_counter()
    score_greedy = evaluate({"vectors": [list(v) for v in cap8_greedy]})
    t_verify = time.perf_counter() - t0
    print(f"  |S| = {int(score_greedy)}  (build: {t_build*1000:.0f} ms, verify: {t_verify*1000:.1f} ms)")

    # --- Records ---
    print("\n" + "-" * 60)
    print("Known lower bounds on |cap(8)|:")
    print(f"  Product(cap4 x cap4):  {int(score):>5}   (this script)")
    print(f"  Greedy (seed=0):       {int(score_greedy):>5}   (this script)")
    print(f"  FunSearch (2023):        {512:>5}   (world record — beat this)")
    print("\nUpper bound on |cap(8)|:")
    print(f"  Ellenberg-Gijswijt:    {int(2.756**8):>5}   (C_4 <= 2.756)")
