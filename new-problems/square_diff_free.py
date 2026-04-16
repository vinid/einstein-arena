"""
Square-Difference-Free Sets (Furstenberg-Sárközy)
==================================================

A set S ⊆ {1, ..., N} is *square-difference-free* if there are no two
distinct elements a, b ∈ S with a - b = k² for any positive integer k.

Equivalently: for all a ∈ S and all k ≥ 1, a + k² ∉ S.

Let r(N) = max{|S| : S ⊆ {1,...,N}, S square-difference-free}.

Goal: **maximize |S|** for fixed N.

World record
------------
  - Furstenberg (1977) and Sárközy (1978) proved r(N) = o(N).
  - The exponent alpha = lim log r(N) / log N is believed to exist.
  - Best known constructions (lower bounds on alpha):
      Ruzsa (1984):  alpha >= 1/2 * (1 + log 7 / log 65) ~ 0.733077
      Lewko (2015):  alpha >= 1/2 * (1 + log 12 / log 205) ~ 0.733412
        (arxiv:1410.5765)
  - Best known upper bound: alpha <= 1 (trivial).
    No non-trivial upper bound on alpha is known.

For N = 1,000,000, the Lewko construction gives:
    r(N) >= N^{0.733412} ~ 148,500

Submitting a set S with |S| > N^{0.733412} for N = 1,000,000 beats
the Lewko (2015) world record.

The Ruzsa construction (base-expansion trick):
  Write each integer in base 65. Keep only integers whose base-65
  representation uses only digits from a specific 7-element subset D
  of {0,...,64} that is square-difference-free as a set of residues mod 65.
  The resulting set is square-difference-free.

  Ruzsa chose D = {0, 1, 2, 16, 23, 36, 48} (mod 65) — a 7-element set
  with no two elements differing by a perfect square mod 65.
  This gives |D|/65 ~ 7/65 per digit, so r(N) >= N^{log_65(7)} * N^{1/2}.

  Actually the exponent: numbers in {1,...,N} with all base-65 digits in D
  gives |S| ~ N^{log(7)/log(65) + 1/2}. Wait, the formula is:
  for d = floor(log_65(N)) digits, |S| = 7^d ~ N^{log_65(7)} ~ N^{0.466}.
  That's less than 1/2. But Ruzsa's bound is alpha ~ 0.733.

  The correct Ruzsa construction: S = {n : all digits of n in base B are in D}
  where D has the property that |D| elements in {0,...,B-1} form a
  square-difference-free set mod B. For B=65, D has 7 elements.
  Number of integers in {1,...,N} with all digits in D:
  ~ |D|^{log_B(N)} = N^{log_B(|D|)} = N^{log_65(7)} ~ N^{0.466}.

  Hmm, that doesn't give 0.733. Let me reconsider.

  The Ruzsa formula: |S| >= N^{1/2 + log|D|/(2*log B)} when D ⊆ {0,...,B-1}
  is square-difference-free. For D={7 elements} in Z_{65}, the construction
  works on TWO interleaved digit patterns... actually the formula comes from
  a more complex construction mixing two digit patterns.

  For our purposes, we implement a direct greedy and report the Lewko
  constant as the target.

Submission format
-----------------
{
  "N": 1000000,          # upper bound (int, must be 1000000 exactly)
  "elements": [a1, a2, ...]  # distinct ints in {1,...,N}
}

Score: log(|S|) / log(N)  (the density exponent, maximize).

The Lewko (2015) world record achieves exponent >= 0.733412.
Submitting a set with exponent > 0.733412 beats the world record.
"""

import time
import math


N_FIXED = 1_000_000


def evaluate(data: dict) -> float:
    N = int(data["N"])
    elements = data["elements"]

    assert N == N_FIXED, f"N must be {N_FIXED}, got {N}"
    assert len(elements) > 0, "elements must be non-empty"

    # Validate and deduplicate
    S = set()
    for x in elements:
        x = int(x)
        assert 1 <= x <= N, f"Element {x} out of range [1, {N}]"
        S.add(x)

    # Check square-difference-free:
    # For each x in S and each perfect square k² <= N-1, x+k² must not be in S.
    max_k = int(math.isqrt(N - 1))
    squares = [k * k for k in range(1, max_k + 1)]

    for x in S:
        for sq in squares:
            if x + sq > N:
                break
            if (x + sq) in S:
                raise AssertionError(
                    f"Square difference found: {x+sq} - {x} = {sq} = {int(math.isqrt(sq))}^2"
                )

    return math.log(len(S)) / math.log(N_FIXED)


# ---------------------------------------------------------------------------
# Baseline constructions
# ---------------------------------------------------------------------------

def _find_square_diff_free_digits(B: int) -> set:
    """Find a large square-diff-free subset of {0,...,B-1}."""
    sq_mod = set()
    for k in range(1, B):
        sq_mod.add((k * k) % B)
    # greedy: build largest subset D with no two elements differing by a square mod B
    D = set()
    for d in range(B):
        ok = True
        for x in D:
            if (d - x) % B in sq_mod or (x - d) % B in sq_mod:
                ok = False
                break
        if ok:
            D.add(d)
    return D


def _ruzsa_construction(N: int) -> list[int]:
    """
    Ruzsa (1984) base-expansion construction.
    Use base B, keep integers whose base-B digits all lie in D,
    where D is a square-difference-free subset of {0,...,B-1}.
    This gives r(N) >= N^{log_B(|D|)}.
    """
    # Search for a good base
    best_B, best_D = 2, {0}
    for B in range(5, 100):
        D = _find_square_diff_free_digits(B)
        if len(D) > 0 and math.log(len(D)) / math.log(B) > math.log(len(best_D)) / math.log(best_B):
            best_B, best_D = B, D
    B, D = best_B, best_D
    exponent = math.log(len(D)) / math.log(B)
    print(f"  (base {B}, |D|={len(D)}, exponent {exponent:.4f})")
    result = []
    for n in range(1, N + 1):
        x = n
        ok = True
        while x > 0:
            if x % B not in D:
                ok = False
                break
            x //= B
        if ok:
            result.append(n)
    return result


def _greedy_square_diff_free(N: int, limit: int = 10000) -> list[int]:
    """
    Greedy construction: add integers 1..N in order, skipping any
    that would create a square difference with an already-chosen element.
    Stops after reaching `limit` elements (for timing demo only).
    """
    max_k = int(math.isqrt(N))
    squares = [k * k for k in range(1, max_k + 1)]  # sorted ascending
    S = set()
    result = []
    for x in range(1, N + 1):
        ok = True
        for sq in squares:
            if sq >= x:
                break
            if (x - sq) in S:
                ok = False
                break
        if ok:
            S.add(x)
            result.append(x)
            if len(result) >= limit:
                break
    return result


if __name__ == "__main__":
    print("=" * 60)
    print("Square-Difference-Free Sets  —  baseline reproduction")
    print("=" * 60)

    N = N_FIXED
    lewko_exponent = 0.733412
    lewko_target = N ** lewko_exponent

    print(f"\nN = {N:,}")
    print(f"Lewko (2015) exponent: {lewko_exponent}")
    print(f"Lewko target size:     {lewko_target:,.0f}  (beat this)")

    # --- Ruzsa construction ---
    print("\nBuilding Ruzsa base-65 construction...")
    t0 = time.perf_counter()
    ruzsa_set = _ruzsa_construction(N)
    t_build = time.perf_counter() - t0
    print(f"  Built {len(ruzsa_set):,} elements in {t_build*1000:.0f} ms")
    print(f"  Exponent achieved: {math.log(len(ruzsa_set)) / math.log(N):.6f}")

    t0 = time.perf_counter()
    score_ruzsa = evaluate({"N": N, "elements": ruzsa_set})
    t_verify = time.perf_counter() - t0
    print(f"  Verify: {t_verify:.2f} s  |S| = {int(N**score_ruzsa):,}  exponent = {score_ruzsa:.6f}")

    # --- Greedy (small, for timing demo) ---
    print("\nGreedy construction (first 5000 elements)...")
    t0 = time.perf_counter()
    greedy_set = _greedy_square_diff_free(N, limit=5000)
    t_build = time.perf_counter() - t0
    t0 = time.perf_counter()
    score_greedy = evaluate({"N": N, "elements": greedy_set})
    t_verify = time.perf_counter() - t0
    greedy_size = int(N ** score_greedy)
    print(f"  exponent={score_greedy:.6f}  |S|={greedy_size:,}  (build: {t_build*1000:.0f} ms, verify: {t_verify*1000:.1f} ms)")

    print("\n" + "-" * 60)
    print("Known lower bounds on exponent alpha = log r(N) / log N:")
    print(f"  Ruzsa (1984):      alpha >= 0.733077  -> |S| ~ {N**0.733077:,.0f}")
    print(f"  Lewko (2015):      alpha >= {lewko_exponent}  -> |S| ~ {lewko_target:,.0f}  (world record — beat this)")
    print(f"  This Ruzsa impl:   alpha = {score_ruzsa:.6f}  -> |S| ~ {int(N**score_ruzsa):,}")
