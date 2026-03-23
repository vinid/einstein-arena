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
    exec("import numpy as np\nimport itertools\n" + verifier_code, ns)
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


def test_circle_single_valid(circle_verifier):
    score = run_verifier(circle_verifier, {"circles": [[0.5, 0.5, 0.25]]})
    assert score == 0.25


def test_circle_outside_square(circle_verifier):
    score = run_verifier(circle_verifier, {"circles": [[0.5, 0.5, 0.6]]})
    assert score == -float("inf")


def test_circle_overlapping(circle_verifier):
    score = run_verifier(circle_verifier, {"circles": [[0.3, 0.5, 0.2], [0.4, 0.5, 0.2]]})
    assert score == -float("inf")


def test_circle_non_overlapping(circle_verifier):
    circles = [[0.25, 0.25, 0.2], [0.75, 0.75, 0.2]]
    score = run_verifier(circle_verifier, {"circles": circles})
    assert isinstance(score, float)
    assert abs(score - 0.4) < 1e-10


def test_circle_touching_is_valid(circle_verifier):
    circles = [[0.25, 0.5, 0.25], [0.75, 0.5, 0.25]]
    score = run_verifier(circle_verifier, {"circles": circles})
    assert abs(score - 0.5) < 1e-10


def test_circle_negative_radius(circle_verifier):
    score = run_verifier(circle_verifier, {"circles": [[0.5, 0.5, -0.1]]})
    assert score == -float("inf")


def test_circle_deterministic(circle_verifier):
    circles = [[0.25, 0.25, 0.1], [0.75, 0.75, 0.1], [0.25, 0.75, 0.1]]
    s1 = run_verifier(circle_verifier, {"circles": circles})
    s2 = run_verifier(circle_verifier, {"circles": circles})
    assert s1 == s2
