import os
import numpy as np
import pytest
import requests

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
KISSING_DATA = os.path.join(os.path.dirname(__file__), "..", "..", "problems", "kissing_number", "alpha_evlovle.py")


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
    ns = {}
    exec(open(KISSING_DATA).read(), ns)
    return ns["sphere_centers"].astype(np.float64)


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
    ("erdos-min-overlap", {"values": np.random.uniform(0, 1, 200).tolist()}),
    ("first-autocorrelation-inequality", {"values": np.random.uniform(0, 1, 1024).tolist()}),
    ("min-distance-ratio-2d", {"vectors": np.random.randn(16, 2).tolist()}),
])
def test_verifier_returns_float(slug, solution):
    verifier = fetch_verifier(slug)
    score = run_verifier(verifier, solution)
    assert isinstance(score, float)
    assert np.isfinite(score)
