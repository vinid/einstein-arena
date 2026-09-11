import os
import json
import requests
import numpy as np
import pytest

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
BASELINES_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "baselines")

EXPECTED_SCORES = {
    "AlphaEvolve": {
        "erdos-min-overlap": 0.38092303510845016,
        "first-autocorrelation-inequality": 1.505293968440161,
        "second-autocorrelation-inequality": 0.9610210777840541,
        "third-autocorrelation-inequality": 1.4556427953745403,
        "min-distance-ratio-2d": 12.88926611203463,
        "prime-number-theorem": 0.9212920229340907,
        "uncertainty-principle": 0.3282706224814065,
        "thomson-problem": 37147.29441846226,
        "tammes-problem": 0.5134718904391984,
        "flat-polynomials": 1.3409252794557085,
        "edges-vs-triangles": -0.7124938782214396,
        "circle-packing": 2.6359830849176076,
        "heilbronn-triangles": 0.036529889880030156,
        "heilbronn-convex": 0.02783557145848214,
        "hexagon-packing": 3.9419123,
        "circles-rectangle": 2.3658321334167627,
        "difference-bases": 2.639027469506608,
        "ring-loading-15": 1.1190475684692773,
    },
    "TTT-Discover": {
        "erdos-min-overlap": 0.3808753232177187,
        "first-autocorrelation-inequality": 1.5028628982558265,
        "second-autocorrelation-inequality": 0.9591797711481764,
    },
    "Together-AI": {
        "erdos-min-overlap": 0.3808703105862199,
        "first-autocorrelation-inequality": 1.5028628587053106,
        "second-autocorrelation-inequality": 0.9612055422690042,
        "third-autocorrelation-inequality": 1.4545548626983331,
        "kissing-number-d11": 0.6279768607340042,
        "prime-number-theorem": 0.994179461377618,
    },
    "Polak-Schrijver": {
        "shannon-capacity-c7-5": 367.0,
    },
    "Youhua-Li": {
        "spencer-discrepancy": 7 / np.sqrt(17),
    },
    "Ma-Tang": {
        "sidon-45-set": 4 / 7,
    },
}

AGENTS_FILES = {
    "AlphaEvolve": ["alphaevolve.json", "ring-loading-alphaevolve.json"],
    "TTT-Discover": ["ttt-discover.json"],
    "Together-AI": ["together-ai.json"],
    "Polak-Schrijver": ["polak-schrijver.json"],
    "Youhua-Li": ["youhua-li.json"],
    "Ma-Tang": ["ma-tang.json"],
}


def fetch_verifier(slug):
    resp = requests.get(f"{BASE}/api/problems/{slug}", timeout=10)
    resp.raise_for_status()
    return resp.json()["verifier"]


def run_verifier(verifier_code, solution_data):
    ns = {}
    exec(verifier_code, ns)
    return ns["evaluate"](solution_data)


def load_baseline(agent_name):
    solutions = {}
    for filename in AGENTS_FILES[agent_name]:
        path = os.path.join(BASELINES_DIR, filename)
        with open(path) as f:
            loaded = json.load(f)
        overlap = solutions.keys() & loaded.keys()
        if overlap:
            raise ValueError(f"Duplicate baseline slugs: {sorted(overlap)}")
        solutions.update(loaded)
    return solutions


def baseline_cases():
    cases = []
    for agent, slugs in EXPECTED_SCORES.items():
        for slug, expected in slugs.items():
            cases.append((agent, slug, expected))
    return cases


@pytest.fixture(scope="module")
def verifiers():
    cache = {}
    for slugs in EXPECTED_SCORES.values():
        for slug in slugs:
            if slug not in cache:
                cache[slug] = fetch_verifier(slug)
    return cache


@pytest.mark.parametrize("agent,slug,expected", baseline_cases(), ids=[f"{a}:{s}" for a, s, _ in baseline_cases()])
def test_baseline_score(agent, slug, expected, verifiers):
    baseline = load_baseline(agent)
    solution = baseline[slug]["solution"]
    verifier = verifiers[slug]
    score = run_verifier(verifier, solution)
    assert abs(score - expected) < 1e-10, f"{agent}/{slug}: got {score}, expected {expected}"
