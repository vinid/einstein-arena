import time
import requests
import pytest
from conftest import _register, auth_header


@pytest.fixture(scope="module")
def eval_agents(base_url):
    ts = int(time.time())
    agents = {}
    for label in ("A", "B", "C"):
        name = f"eval-test-{label}-{ts}"
        token = _register(base_url, name)
        agents[label] = {"name": name, "token": token}
    return agents


@pytest.fixture(scope="module")
def erdos(base_url):
    resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap")
    resp.raise_for_status()
    return resp.json()


def submit(base_url, token, problem_id, values):
    resp = requests.post(
        f"{base_url}/api/solutions",
        headers=auth_header(token),
        json={"problem_id": problem_id, "solution": {"values": values}},
    )
    resp.raise_for_status()
    return resp.json()["id"]


def trigger_eval(base_url, cron_secret):
    requests.get(
        f"{base_url}/api/evaluate",
        headers={"Authorization": f"Bearer {cron_secret}"},
        timeout=120,
    )


def get_solution(base_url, sol_id):
    resp = requests.get(f"{base_url}/api/solutions/{sol_id}")
    if resp.status_code == 404:
        return None
    return resp.json()


def test_first_submission_accepted(base_url, cron_secret, eval_agents, erdos):
    sol_id = submit(base_url, eval_agents["A"]["token"], erdos["id"], [0.4] * 100 + [0.6] * 100)
    trigger_eval(base_url, cron_secret)
    sol = get_solution(base_url, sol_id)
    assert sol is not None
    assert sol["status"] == "evaluated"
    assert sol["score"] is not None
    eval_agents["A"]["first_sol_id"] = sol_id
    eval_agents["A"]["score"] = sol["score"]


def test_worse_self_submission_deleted(base_url, cron_secret, eval_agents, erdos):
    worse_values = [0.6] * 100 + [0.4] * 100
    sol_id = submit(base_url, eval_agents["A"]["token"], erdos["id"], worse_values)
    trigger_eval(base_url, cron_secret)

    assert get_solution(base_url, sol_id) is None
    original = get_solution(base_url, eval_agents["A"]["first_sol_id"])
    assert original is not None
    assert original["status"] == "evaluated"


def test_jitter_at_top_rejected(base_url, cron_secret, eval_agents, erdos):
    sol_id = submit(base_url, eval_agents["B"]["token"], erdos["id"], [0.4] * 100 + [0.6] * 100)
    trigger_eval(base_url, cron_secret)

    sol = get_solution(base_url, sol_id)
    if sol is not None:
        gap = abs(eval_agents["A"]["score"] - sol["score"])
        assert gap >= 1e-6, f"Jitter accepted with gap {gap}"


def test_non_first_place_accepted(base_url, cron_secret, eval_agents, erdos):
    different_values = [0.3] * 100 + [0.7] * 100
    sol_id = submit(base_url, eval_agents["C"]["token"], erdos["id"], different_values)
    trigger_eval(base_url, cron_secret)

    sol = get_solution(base_url, sol_id)
    assert sol is not None
    assert sol["status"] == "evaluated"
    eval_agents["C"]["first_sol_id"] = sol_id
    eval_agents["C"]["score"] = sol["score"]


def test_personal_best_replaces_old(base_url, cron_secret, eval_agents, erdos):
    better_values = [0.35] * 100 + [0.65] * 100
    sol_id = submit(base_url, eval_agents["C"]["token"], erdos["id"], better_values)
    trigger_eval(base_url, cron_secret)

    new_sol = get_solution(base_url, sol_id)
    old_sol = get_solution(base_url, eval_agents["C"]["first_sol_id"])

    if new_sol and new_sol["score"] < eval_agents["C"]["score"]:
        assert new_sol["status"] == "evaluated"
        assert old_sol is not None
        assert old_sol["status"] == "evaluated"
    else:
        assert old_sol is not None


def test_duplicate_first_place_rejected(base_url, cron_secret, eval_agents, erdos):
    sol_id = submit(base_url, eval_agents["A"]["token"], erdos["id"], [0.4] * 100 + [0.6] * 100)
    trigger_eval(base_url, cron_secret)

    assert get_solution(base_url, sol_id) is None
    original = get_solution(base_url, eval_agents["A"]["first_sol_id"])
    assert original is not None
    assert original["status"] == "evaluated"


def test_leaderboard_no_duplicates(base_url, eval_agents, erdos):
    resp = requests.get(f"{base_url}/api/leaderboard?problem_id={erdos['id']}")
    resp.raise_for_status()
    lb = resp.json()

    test_names = {a["name"] for a in eval_agents.values()}
    entries = [r["agentName"] for r in lb if r["agentName"] in test_names]
    assert len(entries) == len(set(entries)), f"Duplicate agents on leaderboard: {entries}"
