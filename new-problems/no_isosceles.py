"""
No Isosceles Triangles in the 64×64 Integer Grid
=================================================

Find the largest subset S of the integer grid {0,...,63}^2 such that no
three distinct points in S form an isosceles triangle (including the
degenerate/collinear case where two inter-point distances are equal).

Three points a, b, c are isosceles iff at least two of the three pairwise
squared Euclidean distances are equal:

    ||a-b||^2 == ||a-c||^2  OR
    ||a-b||^2 == ||b-c||^2  OR
    ||a-c||^2 == ||b-c||^2

Squared distances are integers, so the check is exact (no floating point).

Goal: **maximize |S|** for the fixed 64×64 grid.

World record
------------
  - Previous best (pre-2025): 110 points.
  - AlphaEvolve (2025, Romera-Paredes et al., arXiv:2506.06605):
      112 points in the 64×64 grid — the current world record.

Submitting any isosceles-free set with |S| > 112 in the 64×64 grid
constitutes a new mathematical world record.

Submission format
-----------------
{
  "points": [[x1,y1], [x2,y2], ...]   # ints, 0 <= x,y <= 63
}

Score: |S| (integer, maximize).
"""

import time
import random
from itertools import combinations


N = 64


def _sq_dist(a: tuple, b: tuple) -> int:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def evaluate(data: dict) -> float:
    points_raw = data["points"]

    assert len(points_raw) > 0, "points must be non-empty"

    pts = []
    seen = set()
    for p in points_raw:
        x, y = int(p[0]), int(p[1])
        assert 0 <= x < N and 0 <= y < N, (
            f"Point ({x},{y}) out of grid [0,{N-1}]^2"
        )
        key = (x, y)
        if key not in seen:
            pts.append(key)
            seen.add(key)

    for i, a in enumerate(pts):
        for j in range(i + 1, len(pts)):
            b = pts[j]
            dab = _sq_dist(a, b)
            for k in range(j + 1, len(pts)):
                c = pts[k]
                dac = _sq_dist(a, c)
                dbc = _sq_dist(b, c)
                if dab == dac or dab == dbc or dac == dbc:
                    raise AssertionError(
                        f"Isosceles triangle: {a}, {b}, {c} "
                        f"(sq-dists: {dab}, {dac}, {dbc})"
                    )

    return float(len(pts))


# ---------------------------------------------------------------------------
# Baseline constructions
# ---------------------------------------------------------------------------

# AlphaEvolve world record — 112 points in the 64×64 grid (arXiv:2506.06605)
ALPHAEVOLVE_64 = [
    (58, 56), (55, 2), (58, 1), (61, 52), (1, 40), (14, 7), (58, 62),
    (63, 25), (5, 1), (58, 7), (58, 25), (38, 56), (25, 56), (49, 56),
    (25, 1), (2, 11), (24, 11), (38, 62), (61, 27), (38, 7), (49, 7),
    (61, 36), (57, 17), (39, 11), (56, 61), (45, 61), (0, 38), (1, 33),
    (47, 0), (6, 17), (8, 2), (10, 63), (0, 62), (59, 26), (1, 2),
    (16, 0), (18, 61), (7, 61), (52, 26), (11, 22), (62, 3), (53, 0),
    (55, 61), (52, 41), (11, 37), (62, 30), (57, 46), (2, 52), (63, 38),
    (24, 52), (58, 17), (6, 46), (24, 58), (39, 52), (59, 37), (16, 63),
    (63, 62), (62, 60), (5, 38), (52, 37), (2, 27), (5, 56), (62, 23),
    (2, 36), (17, 0), (5, 62), (8, 61), (5, 7), (10, 0), (1, 61),
    (5, 25), (46, 63), (25, 62), (25, 7), (24, 5), (1, 3), (38, 1),
    (58, 46), (11, 26), (58, 38), (39, 5), (1, 30), (5, 46), (11, 41),
    (14, 58), (17, 63), (61, 11), (62, 40), (57, 1), (0, 1), (1, 60),
    (57, 62), (6, 1), (49, 58), (6, 62), (1, 23), (0, 25), (56, 2),
    (45, 2), (47, 63), (14, 5), (62, 33), (5, 17), (46, 0), (39, 58),
    (7, 2), (18, 2), (52, 22), (49, 5), (63, 1), (53, 63), (14, 56),
]


def _greedy_no_isosceles(seed: int = 0) -> list[tuple]:
    rng = random.Random(seed)
    all_pts = [(x, y) for x in range(N) for y in range(N)]
    rng.shuffle(all_pts)

    chosen = []
    for p in all_pts:
        dp = [_sq_dist(p, q) for q in chosen]
        if len(set(dp)) < len(dp):
            continue
        ok = True
        for i in range(len(chosen)):
            for j in range(i + 1, len(chosen)):
                dij = _sq_dist(chosen[i], chosen[j])
                if dij == dp[i] or dij == dp[j]:
                    ok = False
                    break
            if not ok:
                break
        if ok:
            chosen.append(p)
    return chosen


if __name__ == "__main__":
    print("=" * 60)
    print("No Isosceles Triangles in 64×64 grid  —  baseline")
    print("=" * 60)

    # --- AlphaEvolve world record ---
    print(f"\nAlphaEvolve construction ({len(ALPHAEVOLVE_64)} points)...")
    t0 = time.perf_counter()
    score_ae = evaluate({"points": [list(p) for p in ALPHAEVOLVE_64]})
    t_verify = time.perf_counter() - t0
    print(f"  |S| = {int(score_ae)}  (verify: {t_verify*1000:.1f} ms)")

    # --- Greedy baselines ---
    print("\nGreedy baselines (3 seeds)...")
    for seed in range(3):
        t0 = time.perf_counter()
        pts = _greedy_no_isosceles(seed=seed)
        t_build = time.perf_counter() - t0
        t0 = time.perf_counter()
        score = evaluate({"points": [list(p) for p in pts]})
        t_verify = time.perf_counter() - t0
        print(f"  seed={seed}: |S|={int(score)}  (build: {t_build*1000:.0f} ms, verify: {t_verify*1000:.1f} ms)")

    print("\n" + "-" * 60)
    print("World records (64×64 grid):")
    print(f"  Previous best (pre-2025):    110  points")
    print(f"  AlphaEvolve (2025):          112  points  (world record — beat this)")
