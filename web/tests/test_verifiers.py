import json
import math
import os

import numpy as np
import pytest
import requests

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")


def fetch_verifier(slug):
    resp = requests.get(f"{BASE}/api/problems/{slug}", timeout=10)
    resp.raise_for_status()
    return resp.json()["verifier"]


def run_verifier(verifier_code, solution_data):
    ns = {}
    exec(verifier_code, ns)
    return ns["evaluate"](solution_data)


@pytest.fixture(scope="module")
def kissing_verifier():
    return fetch_verifier("kissing-number-d11")


@pytest.fixture(scope="module")
def alphaevolve_593():
    np.random.seed(0)
    return np.random.randn(593, 11)


def test_kissing_wrong_shape_rejected(kissing_verifier):
    with pytest.raises(ValueError, match="Expected shape"):
        run_verifier(kissing_verifier, {"vectors": np.random.randn(100, 11).tolist()})


def test_kissing_wrong_dimension_rejected(kissing_verifier):
    with pytest.raises(ValueError, match="Expected shape"):
        run_verifier(kissing_verifier, {"vectors": np.random.randn(594, 5).tolist()})


def test_kissing_zero_vectors_rejected(kissing_verifier):
    with pytest.raises(ValueError, match="non-zero"):
        run_verifier(kissing_verifier, {"vectors": np.zeros((594, 11)).tolist()})


def test_kissing_duplicate_vector_has_overlap(kissing_verifier, alphaevolve_593):
    vecs = np.vstack([alphaevolve_593, alphaevolve_593[0:1]])
    score = run_verifier(kissing_verifier, {"vectors": vecs.tolist()})
    assert score > 0


def test_kissing_random_594_positive_score(kissing_verifier):
    score = run_verifier(kissing_verifier, {"vectors": np.random.randn(594, 11).tolist()})
    assert score > 0


def test_kissing_float_skips_exact_check(kissing_verifier):
    score = run_verifier(kissing_verifier, {"vectors": (np.random.randn(594, 11) * 0.1).tolist()})
    assert isinstance(score, float)
    assert score > 0


def test_kissing_593_plus_random_positive(kissing_verifier, alphaevolve_593):
    extra = np.random.randn(1, 11)
    vecs = np.vstack([alphaevolve_593, extra])
    score = run_verifier(kissing_verifier, {"vectors": vecs.tolist()})
    assert score > 0


def test_kissing_deterministic(kissing_verifier):
    np.random.seed(42)
    vecs = np.random.randn(594, 11)
    s1 = run_verifier(kissing_verifier, {"vectors": vecs.tolist()})
    s2 = run_verifier(kissing_verifier, {"vectors": vecs.tolist()})
    assert s1 == s2


@pytest.mark.parametrize("slug,key", [
    ("min-distance-ratio-2d", "vectors"),
    ("kissing-number-d11", "vectors"),
])
def test_verifier_rejects_wrong_shape(slug, key):
    verifier = fetch_verifier(slug)
    with pytest.raises((ValueError, Exception)):
        run_verifier(verifier, {key: [[1.0, 2.0]]})


@pytest.mark.parametrize("slug,solution", [
    ("erdos-min-overlap", {"values": np.full(200, 0.5).tolist()}),
    ("first-autocorrelation-inequality", {"values": np.random.uniform(0, 1, 1024).tolist()}),
    ("min-distance-ratio-2d", {"vectors": np.random.randn(16, 2).tolist()}),
])
def test_verifier_returns_float(slug, solution):
    verifier = fetch_verifier(slug)
    score = run_verifier(verifier, solution)
    assert isinstance(score, float)
    assert np.isfinite(score)


# --- Thomson Problem ---

@pytest.fixture(scope="module")
def thomson_verifier():
    return fetch_verifier("thomson-problem")


def test_thomson_wrong_shape(thomson_verifier):
    with pytest.raises(AssertionError):
        run_verifier(thomson_verifier, {"vectors": np.random.randn(10, 3).tolist()})


def test_thomson_random_returns_finite(thomson_verifier):
    pts = np.random.randn(282, 3)
    score = run_verifier(thomson_verifier, {"vectors": pts.tolist()})
    assert isinstance(score, float)
    assert np.isfinite(score)
    assert score > 0


def test_thomson_deterministic(thomson_verifier):
    np.random.seed(99)
    pts = np.random.randn(282, 3)
    s1 = run_verifier(thomson_verifier, {"vectors": pts.tolist()})
    s2 = run_verifier(thomson_verifier, {"vectors": pts.tolist()})
    assert s1 == s2


def test_thomson_normalizes_to_sphere(thomson_verifier):
    pts = np.random.randn(282, 3) * 100
    score = run_verifier(thomson_verifier, {"vectors": pts.tolist()})
    pts_unit = pts / np.linalg.norm(pts, axis=1, keepdims=True)
    score_unit = run_verifier(thomson_verifier, {"vectors": pts_unit.tolist()})
    assert abs(score - score_unit) < 1e-10


def test_thomson_duplicate_points_high_energy(thomson_verifier):
    pt = [1.0, 0.0, 0.0]
    pts = [pt] * 282
    score = run_verifier(thomson_verifier, {"vectors": pts})
    assert score > 1e10


# --- Tammes Problem ---

@pytest.fixture(scope="module")
def tammes_verifier():
    return fetch_verifier("tammes-problem")


def test_tammes_wrong_shape(tammes_verifier):
    with pytest.raises(AssertionError):
        run_verifier(tammes_verifier, {"vectors": np.random.randn(10, 3).tolist()})


def test_tammes_random_returns_finite(tammes_verifier):
    pts = np.random.randn(50, 3)
    score = run_verifier(tammes_verifier, {"vectors": pts.tolist()})
    assert isinstance(score, float)
    assert np.isfinite(score)
    assert score > 0


def test_tammes_deterministic(tammes_verifier):
    np.random.seed(77)
    pts = np.random.randn(50, 3)
    s1 = run_verifier(tammes_verifier, {"vectors": pts.tolist()})
    s2 = run_verifier(tammes_verifier, {"vectors": pts.tolist()})
    assert s1 == s2


def test_tammes_normalizes_to_sphere(tammes_verifier):
    pts = np.random.randn(50, 3) * 50
    score = run_verifier(tammes_verifier, {"vectors": pts.tolist()})
    pts_unit = pts / np.linalg.norm(pts, axis=1, keepdims=True)
    score_unit = run_verifier(tammes_verifier, {"vectors": pts_unit.tolist()})
    assert abs(score - score_unit) < 1e-10


def test_tammes_duplicate_points_zero_distance(tammes_verifier):
    pt = [0.0, 0.0, 1.0]
    pts = [pt] * 50
    score = run_verifier(tammes_verifier, {"vectors": pts})
    assert score == 0.0


# --- Flat Polynomials ---

@pytest.fixture(scope="module")
def flat_poly_verifier():
    return fetch_verifier("flat-polynomials")


def test_flat_poly_wrong_length(flat_poly_verifier):
    with pytest.raises(AssertionError):
        run_verifier(flat_poly_verifier, {"coefficients": [1] * 50})


def test_flat_poly_non_pm1_rejected(flat_poly_verifier):
    with pytest.raises(AssertionError):
        run_verifier(flat_poly_verifier, {"coefficients": [2] * 70})


def test_flat_poly_all_ones(flat_poly_verifier):
    score = run_verifier(flat_poly_verifier, {"coefficients": [1] * 70})
    assert isinstance(score, float)
    assert score > 0


def test_flat_poly_alternating(flat_poly_verifier):
    coeffs = [(-1) ** i for i in range(70)]
    score = run_verifier(flat_poly_verifier, {"coefficients": coeffs})
    assert isinstance(score, float)
    assert np.isfinite(score)
    assert score >= 1.0


def test_flat_poly_deterministic(flat_poly_verifier):
    coeffs = [1, -1] * 35
    s1 = run_verifier(flat_poly_verifier, {"coefficients": coeffs})
    s2 = run_verifier(flat_poly_verifier, {"coefficients": coeffs})
    assert s1 == s2


# --- Edges vs Triangles ---

@pytest.fixture(scope="module")
def edges_tri_verifier():
    return fetch_verifier("edges-vs-triangles")


def test_edges_tri_wrong_row_length(edges_tri_verifier):
    with pytest.raises(AssertionError):
        run_verifier(edges_tri_verifier, {"weights": [[1.0] * 10]})


def test_edges_tri_single_row(edges_tri_verifier):
    row = [1.0] + [0.0] * 19
    score = run_verifier(edges_tri_verifier, {"weights": [row]})
    assert isinstance(score, float)
    assert np.isfinite(score)


def test_edges_tri_uniform_rows(edges_tri_verifier):
    rows = [[1.0 / 20] * 20 for _ in range(5)]
    score = run_verifier(edges_tri_verifier, {"weights": rows})
    assert isinstance(score, float)
    assert np.isfinite(score)


def test_edges_tri_normalizes_rows(edges_tri_verifier):
    rows = [[10.0] * 20 for _ in range(3)]
    score = run_verifier(edges_tri_verifier, {"weights": rows})
    rows_norm = [[0.05] * 20 for _ in range(3)]
    score_norm = run_verifier(edges_tri_verifier, {"weights": rows_norm})
    assert abs(score - score_norm) < 1e-10


def test_edges_tri_deterministic(edges_tri_verifier):
    np.random.seed(55)
    rows = np.random.rand(10, 20).tolist()
    s1 = run_verifier(edges_tri_verifier, {"weights": rows})
    s2 = run_verifier(edges_tri_verifier, {"weights": rows})
    assert s1 == s2


# --- Circle Packing ---

@pytest.fixture(scope="module")
def circle_verifier():
    return fetch_verifier("circle-packing")


def _pad_circles(circles, n=26):
    r = 0.001
    padded = list(circles)
    for i in range(n - len(padded)):
        padded.append([r, r + i * 3 * r, r])
    return padded


def test_circle_wrong_count(circle_verifier):
    with pytest.raises(AssertionError):
        run_verifier(circle_verifier, {"circles": [[0.5, 0.5, 0.25]]})


def test_circle_outside_square(circle_verifier):
    circles = _pad_circles([[0.5, 0.5, 0.6]])
    score = run_verifier(circle_verifier, {"circles": circles})
    assert score == -float("inf")


def test_circle_overlapping(circle_verifier):
    circles = _pad_circles([[0.3, 0.5, 0.2], [0.4, 0.5, 0.2]])
    score = run_verifier(circle_verifier, {"circles": circles})
    assert score == -float("inf")


def test_circle_non_overlapping(circle_verifier):
    circles = _pad_circles([[0.25, 0.25, 0.2], [0.75, 0.75, 0.2]])
    score = run_verifier(circle_verifier, {"circles": circles})
    assert isinstance(score, float)
    assert score > 0


def test_circle_touching_is_valid(circle_verifier):
    circles = _pad_circles([[0.25, 0.5, 0.25], [0.75, 0.5, 0.25]])
    score = run_verifier(circle_verifier, {"circles": circles})
    assert score > 0.5 - 1e-6


def test_circle_negative_radius(circle_verifier):
    circles = _pad_circles([[0.5, 0.5, -0.1]])
    score = run_verifier(circle_verifier, {"circles": circles})
    assert score == -float("inf")


def test_circle_deterministic(circle_verifier):
    circles = _pad_circles([[0.25, 0.25, 0.1], [0.75, 0.75, 0.1], [0.25, 0.75, 0.1]])
    s1 = run_verifier(circle_verifier, {"circles": circles})
    s2 = run_verifier(circle_verifier, {"circles": circles})
    assert s1 == s2


# ---------------------------------------------------------------------------
# Helpers shared by the 5 new problems
# ---------------------------------------------------------------------------

def _load_alphaevolve():
    path = os.path.join(os.path.dirname(__file__), "..", "data", "baselines", "alphaevolve.json")
    with open(path) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Heilbronn Problem for Triangles (n = 11)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def heilbronn_tri_verifier():
    return fetch_verifier("heilbronn-triangles")


def test_heilbronn_tri_wrong_count(heilbronn_tri_verifier):
    pts = [[0.1 * i, 0.0] for i in range(10)]
    score = run_verifier(heilbronn_tri_verifier, {"points": pts})
    assert score == -float("inf")


def test_heilbronn_tri_point_outside_triangle(heilbronn_tri_verifier):
    pts = [[0.5, 0.5 * math.sqrt(3)]] + [[0.1 * i, 0.05] for i in range(10)]
    score = run_verifier(heilbronn_tri_verifier, {"points": pts})
    assert score == -float("inf")


def test_heilbronn_tri_collinear_points_zero(heilbronn_tri_verifier):
    pts = [[i / 10.0, 0.0] for i in range(11)]
    score = run_verifier(heilbronn_tri_verifier, {"points": pts})
    assert score == 0.0


def test_heilbronn_tri_valid_returns_positive(heilbronn_tri_verifier):
    pts = [[0.5 + 0.3 * math.cos(2 * math.pi * i / 11 + 0.1),
            0.3 + 0.2 * math.sin(2 * math.pi * i / 11 + 0.1)] for i in range(11)]
    score = run_verifier(heilbronn_tri_verifier, {"points": pts})
    assert isinstance(score, float)
    assert score > 0


def test_heilbronn_tri_alphaevolve_score(heilbronn_tri_verifier):
    sol = _load_alphaevolve()["heilbronn-triangles"]["solution"]
    score = run_verifier(heilbronn_tri_verifier, sol)
    assert abs(score - 0.0365) < 1e-3


def test_heilbronn_tri_deterministic(heilbronn_tri_verifier):
    pts = [[i / 10.0, 0.05] for i in range(11)]
    s1 = run_verifier(heilbronn_tri_verifier, {"points": pts})
    s2 = run_verifier(heilbronn_tri_verifier, {"points": pts})
    assert s1 == s2


# ---------------------------------------------------------------------------
# Heilbronn Problem for Convex Regions (n = 14)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def heilbronn_conv_verifier():
    return fetch_verifier("heilbronn-convex")


def test_heilbronn_conv_wrong_count(heilbronn_conv_verifier):
    pts = [[math.cos(2 * math.pi * i / 13), math.sin(2 * math.pi * i / 13)] for i in range(13)]
    score = run_verifier(heilbronn_conv_verifier, {"points": pts})
    assert score == -float("inf")


def test_heilbronn_conv_degenerate_collinear(heilbronn_conv_verifier):
    pts = [[float(i), 0.0] for i in range(14)]
    score = run_verifier(heilbronn_conv_verifier, {"points": pts})
    assert score == -float("inf")


def test_heilbronn_conv_regular_polygon_positive(heilbronn_conv_verifier):
    pts = [[math.cos(2 * math.pi * i / 14), math.sin(2 * math.pi * i / 14)] for i in range(14)]
    score = run_verifier(heilbronn_conv_verifier, {"points": pts})
    assert isinstance(score, float)
    assert score > 0


def test_heilbronn_conv_scale_invariant(heilbronn_conv_verifier):
    pts = [[math.cos(2 * math.pi * i / 14), math.sin(2 * math.pi * i / 14)] for i in range(14)]
    pts_big = [[10 * x, 10 * y] for x, y in pts]
    s1 = run_verifier(heilbronn_conv_verifier, {"points": pts})
    s2 = run_verifier(heilbronn_conv_verifier, {"points": pts_big})
    assert abs(s1 - s2) < 1e-9


def test_heilbronn_conv_alphaevolve_score(heilbronn_conv_verifier):
    sol = _load_alphaevolve()["heilbronn-convex"]["solution"]
    score = run_verifier(heilbronn_conv_verifier, sol)
    assert abs(score - 0.0278) < 1e-3


def test_heilbronn_conv_deterministic(heilbronn_conv_verifier):
    pts = [[math.cos(2 * math.pi * i / 14), math.sin(2 * math.pi * i / 14)] for i in range(14)]
    s1 = run_verifier(heilbronn_conv_verifier, {"points": pts})
    s2 = run_verifier(heilbronn_conv_verifier, {"points": pts})
    assert s1 == s2


# ---------------------------------------------------------------------------
# Hexagon Packing in a Hexagon (n = 12)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def hexagon_pack_verifier():
    return fetch_verifier("hexagon-packing")


def _trivial_hexagon_solution(outer_side=5.0):
    hexagons = [[float(i) * 2.5, 0.0, 0.0] for i in range(12)]
    return {
        "hexagons": hexagons,
        "outer_side_length": outer_side,
        "outer_center": [0.0, 0.0],
        "outer_angle_deg": 0.0,
    }


def test_hexagon_wrong_count(hexagon_pack_verifier):
    sol = _trivial_hexagon_solution()
    sol["hexagons"] = sol["hexagons"][:11]
    score = run_verifier(hexagon_pack_verifier, sol)
    assert score == float("inf")


def test_hexagon_non_finite_rejected(hexagon_pack_verifier):
    sol = _trivial_hexagon_solution()
    sol["outer_side_length"] = float("nan")
    score = run_verifier(hexagon_pack_verifier, sol)
    assert score == float("inf")


def test_hexagon_zero_side_rejected(hexagon_pack_verifier):
    sol = _trivial_hexagon_solution(outer_side=0.0)
    score = run_verifier(hexagon_pack_verifier, sol)
    assert score == float("inf")


def test_hexagon_penalty_for_violations(hexagon_pack_verifier):
    sol = _trivial_hexagon_solution(outer_side=5.0)
    score = run_verifier(hexagon_pack_verifier, sol)
    assert score > 5.0


def test_hexagon_alphaevolve_score(hexagon_pack_verifier):
    sol = _load_alphaevolve()["hexagon-packing"]["solution"]
    score = run_verifier(hexagon_pack_verifier, sol)
    assert abs(score - 3.942) < 1e-2
    assert score < 5.0


def test_hexagon_deterministic(hexagon_pack_verifier):
    sol = _load_alphaevolve()["hexagon-packing"]["solution"]
    s1 = run_verifier(hexagon_pack_verifier, sol)
    s2 = run_verifier(hexagon_pack_verifier, sol)
    assert s1 == s2


# ---------------------------------------------------------------------------
# Circles in a Rectangle (n = 21)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def circles_rect_verifier():
    return fetch_verifier("circles-rectangle")


def _grid_circles_21(r=0.08):
    circles = []
    cols, rows = 7, 3
    for row in range(rows):
        for col in range(cols):
            x = r + col * 2 * r
            y = r + row * 2 * r
            circles.append([x, y, r])
    return circles


def test_circles_rect_wrong_count(circles_rect_verifier):
    circles = [[0.1, 0.1, 0.05]] * 20
    score = run_verifier(circles_rect_verifier, {"circles": circles})
    assert score == -float("inf")


def test_circles_rect_negative_radius(circles_rect_verifier):
    circles = _grid_circles_21()
    circles[0][2] = -0.01
    score = run_verifier(circles_rect_verifier, {"circles": circles})
    assert score == -float("inf")


def test_circles_rect_exceeds_perimeter(circles_rect_verifier):
    circles = [[0.6, 0.6, 0.6]] + [[0.01 * i, 0.01, 0.001] for i in range(20)]
    score = run_verifier(circles_rect_verifier, {"circles": circles})
    assert score == -float("inf")


def test_circles_rect_overlapping_rejected(circles_rect_verifier):
    circles = _grid_circles_21()
    circles[1][0] = circles[0][0]
    circles[1][1] = circles[0][1]
    score = run_verifier(circles_rect_verifier, {"circles": circles})
    assert score == -float("inf")


def test_circles_rect_valid_returns_positive(circles_rect_verifier):
    circles = _grid_circles_21()
    score = run_verifier(circles_rect_verifier, {"circles": circles})
    assert isinstance(score, float)
    assert score > 0


def test_circles_rect_alphaevolve_score(circles_rect_verifier):
    sol = _load_alphaevolve()["circles-rectangle"]["solution"]
    score = run_verifier(circles_rect_verifier, sol)
    assert abs(score - 2.365) < 0.01


def test_circles_rect_deterministic(circles_rect_verifier):
    circles = _grid_circles_21()
    s1 = run_verifier(circles_rect_verifier, {"circles": circles})
    s2 = run_verifier(circles_rect_verifier, {"circles": circles})
    assert s1 == s2


# ---------------------------------------------------------------------------
# Difference Bases
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def diff_bases_verifier():
    return fetch_verifier("difference-bases")


def test_diff_bases_empty_set(diff_bases_verifier):
    score = run_verifier(diff_bases_verifier, {"set": []})
    assert score == float("inf")


def test_diff_bases_no_coverage(diff_bases_verifier):
    score = run_verifier(diff_bases_verifier, {"set": [0]})
    assert score == float("inf")


def test_diff_bases_minimal_set(diff_bases_verifier):
    score = run_verifier(diff_bases_verifier, {"set": [0, 1]})
    assert isinstance(score, float)
    assert math.isfinite(score)
    assert abs(score - 4.0) < 1e-9


def test_diff_bases_zero_auto_added(diff_bases_verifier):
    score_with = run_verifier(diff_bases_verifier, {"set": [0, 1, 2, 3]})
    score_without = run_verifier(diff_bases_verifier, {"set": [1, 2, 3]})
    assert abs(score_with - score_without) < 1e-9


def test_diff_bases_over_2000_elements(diff_bases_verifier):
    big_set = list(range(2001))
    score = run_verifier(diff_bases_verifier, {"set": big_set})
    assert score == float("inf")


def test_diff_bases_deduplicates_input(diff_bases_verifier):
    score_dupes = run_verifier(diff_bases_verifier, {"set": [0, 1, 1, 2, 2, 3, 3]})
    score_clean = run_verifier(diff_bases_verifier, {"set": [0, 1, 2, 3]})
    assert abs(score_dupes - score_clean) < 1e-9


def test_diff_bases_alphaevolve_score(diff_bases_verifier):
    sol = _load_alphaevolve()["difference-bases"]["solution"]
    score = run_verifier(diff_bases_verifier, sol)
    assert abs(score - 2.639) < 0.01


def test_diff_bases_deterministic(diff_bases_verifier):
    s = [0, 1, 3, 7, 12, 20]
    s1 = run_verifier(diff_bases_verifier, {"set": s})
    s2 = run_verifier(diff_bases_verifier, {"set": s})
    assert s1 == s2
