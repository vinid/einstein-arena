import time
import requests
from conftest import _register, auth_header, bypass_headers


def submit(base_url, token, problem_id, solution, expected_score=None, score=None):
    body = {"problem_id": problem_id, "solution": solution}
    if expected_score is not None:
        body["expected_score"] = expected_score
    if score is not None:
        body["score"] = score
    return requests.post(
        f"{base_url}/api/solutions",
        headers={**auth_header(token), **bypass_headers()},
        json=body,
    )


def test_response_includes_context_fields(base_url, agent, problem):
    resp = submit(base_url, agent["token"], problem["id"], {"values": [0.5] * 200})
    assert resp.status_code == 201
    data = resp.json()
    assert "current_best" in data
    assert "your_best" in data
    assert "scoring" in data
    assert "min_improvement" in data
    assert data["scoring"] == problem["scoring"]


def test_no_expected_score_always_accepted(base_url, agent, problem):
    resp = submit(base_url, agent["token"], problem["id"], {"values": [0.5] * 200})
    assert resp.status_code == 201


def test_expected_score_good_enough_passes(base_url, agent, problem, cron_secret):
    resp = submit(base_url, agent["token"], problem["id"], {"values": [0.5] * 200}, score=0.381)
    assert resp.status_code == 201
    requests.get(f"{base_url}/api/evaluate", headers={"Authorization": f"Bearer {cron_secret}"}, timeout=120)

    good_score = 0.001
    fresh = _register(base_url, f"expscore-good-{int(time.time())}")
    resp = submit(base_url, fresh, problem["id"], {"values": [0.5] * 200}, expected_score=good_score)
    assert resp.status_code == 201


def test_expected_score_too_close_rejected(base_url, problem):
    fresh = _register(base_url, f"expscore-close-{int(time.time())}")
    resp = submit(base_url, fresh, problem["id"], {"values": [0.5] * 200})
    assert resp.status_code == 201
    current_best = resp.json()["current_best"]
    assert current_best is not None

    tiny = current_best - 1e-8
    resp = submit(base_url, fresh, problem["id"], {"values": [0.5] * 200}, expected_score=tiny)
    assert resp.status_code == 409
    data = resp.json()
    assert data["disposition"] == "rejected_min_improvement"
    assert "current_best" in data
    assert "your_best" in data
    assert "scoring" in data
    assert "min_improvement" in data


def test_expected_score_ties_global_best_rejected(base_url, problem):
    fresh = _register(base_url, f"expscore-tie-{int(time.time())}")
    resp = submit(base_url, fresh, problem["id"], {"values": [0.5] * 200})
    assert resp.status_code == 201
    current_best = resp.json()["current_best"]
    assert current_best is not None

    resp = submit(base_url, fresh, problem["id"], {"values": [0.5] * 200}, expected_score=current_best)
    assert resp.status_code == 409
    assert resp.json()["disposition"] == "rejected_min_improvement"


def test_expected_score_wrong_type_returns_400(base_url, agent, problem):
    resp = requests.post(
        f"{base_url}/api/solutions",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"problem_id": problem["id"], "solution": {"values": [0.5] * 200}, "expected_score": "not_a_number"},
    )
    assert resp.status_code == 400
    assert "expected_score must be a number" in resp.json()["error"]


def test_expected_score_worse_than_personal_best_rejected(base_url, agent, problem, cron_secret):
    resp = submit(base_url, agent["token"], problem["id"], {"values": [0.5] * 200}, score=0.381)
    assert resp.status_code == 201
    requests.get(f"{base_url}/api/evaluate", headers={"Authorization": f"Bearer {cron_secret}"}, timeout=120)

    resp = submit(base_url, agent["token"], problem["id"], {"values": [0.5] * 200}, expected_score=0.99)
    assert resp.status_code == 409
    assert resp.json()["disposition"] == "discarded_personal"
