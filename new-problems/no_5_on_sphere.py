"""
No Five Points on a Common Sphere (11×11×11 Grid)
==================================================

Find the largest subset S of the integer grid {0,...,10}^3 such that no
five distinct points in S are co-spherical or co-planar.

Five points p₁,...,p₅ in ℝ³ are co-spherical (or co-planar, as a degenerate
case) if and only if the following 5×5 determinant is zero:

    | x₁  y₁  z₁  x₁²+y₁²+z₁²  1 |
    | x₂  y₂  z₂  x₂²+y₂²+z₂²  1 |
    | x₃  y₃  z₃  x₃²+y₃²+z₃²  1 | = 0
    | x₄  y₄  z₄  x₄²+y₄²+z₄²  1 |
    | x₅  y₅  z₅  x₅²+y₅²+z₅²  1 |

This condition arises because a sphere in 3D (or plane, as a degenerate
sphere) has 4 degrees of freedom, so 4 generic points determine it uniquely,
and a 5th point lies on it iff the determinant above vanishes.

For integer grid points the determinant is an integer, so the check is exact.

Goal: **maximize |S|** for the fixed 11×11×11 grid.

World record
------------
  - Previous best (pre-2025): 30 points.
  - AlphaEvolve (2025, Romera-Paredes et al., arXiv:2506.06605):
      31 points in the 11×11×11 grid — the current world record.

Submitting any co-sphere-free set with |S| > 31 in the 11×11×11 grid
constitutes a new mathematical world record.

Submission format
-----------------
{
  "points": [[x1,y1,z1], [x2,y2,z2], ...]   # ints, 0 <= x,y,z <= 10
}

Score: |S| (integer, maximize).
"""

import time
import random
import numpy as np
from itertools import combinations


N = 11


def _det5(pts5: list[tuple]) -> float:
    mat = np.zeros((5, 5), dtype=np.float64)
    for i, (x, y, z) in enumerate(pts5):
        mat[i] = [x, y, z, x * x + y * y + z * z, 1.0]
    return np.linalg.det(mat)


def evaluate(data: dict) -> float:
    points_raw = data["points"]

    assert len(points_raw) > 0, "points must be non-empty"

    pts = []
    seen = set()
    for p in points_raw:
        x, y, z = int(p[0]), int(p[1]), int(p[2])
        assert 0 <= x < N and 0 <= y < N and 0 <= z < N, (
            f"Point ({x},{y},{z}) out of grid [0,{N-1}]^3"
        )
        key = (x, y, z)
        if key not in seen:
            pts.append(key)
            seen.add(key)

    m = len(pts)
    if m < 5:
        return float(m)

    # Build batched matrix for all C(m,5) quintuples
    indices = list(combinations(range(m), 5))
    k = len(indices)
    arr = np.zeros((k, 5, 5), dtype=np.float64)
    pts_np = np.array([[x, y, z, x*x+y*y+z*z, 1.0] for x, y, z in pts])
    idx_arr = np.array(indices, dtype=np.int32)
    for col in range(5):
        arr[:, col, :] = pts_np[idx_arr[:, col]]

    dets = np.linalg.det(arr)
    bad = np.where(np.abs(dets) < 0.5)[0]
    if len(bad) > 0:
        b = bad[0]
        bad_pts = [pts[i] for i in indices[b]]
        raise AssertionError(
            f"5 co-spherical/co-planar points found: {bad_pts}"
        )

    return float(m)


# ---------------------------------------------------------------------------
# Baseline constructions
# ---------------------------------------------------------------------------

# AlphaEvolve world record — 31 points in 11×11×11 grid (arXiv:2506.06605)
ALPHAEVOLVE_11 = [
    (5, 2, 2), (1, 2, 9), (5, 7, 3), (9, 7, 10), (3, 8, 0), (0, 3, 2),
    (2, 7, 9), (7, 5, 1), (8, 2, 6), (5, 9, 7), (7, 1, 0), (2, 9, 9),
    (1, 0, 2), (10, 5, 8), (8, 9, 8), (10, 10, 6), (10, 0, 9), (6, 1, 8),
    (10, 4, 1), (1, 10, 4), (9, 0, 1), (9, 8, 5), (0, 1, 3), (9, 9, 0),
    (0, 8, 1), (4, 3, 7), (7, 5, 7), (8, 2, 10), (0, 10, 0), (2, 10, 10),
    (1, 6, 6),
]


def _greedy_no_5_sphere(seed: int = 0) -> list[tuple]:
    rng = random.Random(seed)
    all_pts = [(x, y, z) for x in range(N) for y in range(N) for z in range(N)]
    rng.shuffle(all_pts)

    chosen = []
    pts_np = np.empty((0, 5), dtype=np.float64)

    for p in all_pts:
        x, y, z = p
        row = np.array([[x, y, z, x*x+y*y+z*z, 1.0]])

        if len(chosen) >= 4:
            m = len(chosen)
            # Check all C(m,4) quadruples from chosen plus this new point
            ok = True
            for quad in combinations(range(m), 4):
                mat = np.vstack([pts_np[list(quad)], row])
                if abs(np.linalg.det(mat)) < 0.5:
                    ok = False
                    break
            if not ok:
                continue

        chosen.append(p)
        pts_np = np.vstack([pts_np, row]) if len(pts_np) > 0 else row

    return chosen


if __name__ == "__main__":
    print("=" * 60)
    print("No 5 on Sphere (11×11×11)  —  baseline reproduction")
    print("=" * 60)

    # --- AlphaEvolve world record ---
    print(f"\nAlphaEvolve construction ({len(ALPHAEVOLVE_11)} points)...")
    t0 = time.perf_counter()
    score_ae = evaluate({"points": [list(p) for p in ALPHAEVOLVE_11]})
    t_verify = time.perf_counter() - t0
    print(f"  |S| = {int(score_ae)}  (verify: {t_verify*1000:.1f} ms)")

    # --- Greedy baselines ---
    print("\nGreedy baselines (3 seeds)...")
    for seed in range(3):
        t0 = time.perf_counter()
        pts = _greedy_no_5_sphere(seed=seed)
        t_build = time.perf_counter() - t0
        t0 = time.perf_counter()
        score = evaluate({"points": [list(p) for p in pts]})
        t_verify = time.perf_counter() - t0
        print(f"  seed={seed}: |S|={int(score)}  (build: {t_build*1000:.0f} ms, verify: {t_verify*1000:.1f} ms)")

    print("\n" + "-" * 60)
    print("World records (11×11×11 grid):")
    print(f"  Previous best (pre-2025):    30  points")
    print(f"  AlphaEvolve (2025):          31  points  (world record — beat this)")

    # Timing for an ambitious submission size
    print("\nVerification timing for |S|=35 (hypothetical):")
    from math import comb
    print(f"  C(35,5) = {comb(35,5):,} quintuples to check")
