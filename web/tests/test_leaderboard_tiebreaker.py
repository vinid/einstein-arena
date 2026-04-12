import time
import requests
import pytest
from conftest import _register, auth_header, bypass_headers, RL_BYPASS

pytestmark = pytest.mark.skipif(not RL_BYPASS, reason="RATE_LIMIT_BYPASS_TOKEN required")


@pytest.fixture(scope="module")
def tb_agents(base_url):
    ts = int(time.time())
    agents = {}
    for label in ("A", "B"):
        name = f"tb-test-{label}-{ts}"
        token = _register(base_url, name)
        agents[label] = {"name": name, "token": token}
    return agents


@pytest.fixture(scope="module")
def erdos(base_url):
    resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap")
    resp.raise_for_status()
    return resp.json()


def submit_with_score(base_url, token, problem_id, solution_values, score):
    headers = {**auth_header(token), **bypass_headers()}
    resp = requests.post(
        f"{base_url}/api/solutions",
        headers=headers,
        json={"problem_id": problem_id, "solution": {"values": solution_values}, "score": score},
    )
    resp.raise_for_status()
    return resp.json()["id"]


def leaderboard(base_url, problem_id):
    resp = requests.get(f"{base_url}/api/leaderboard?problem_id={problem_id}&limit=100")
    resp.raise_for_status()
    return {r["agentName"]: r["rank"] for r in resp.json()}


def test_tiebreaker_first_achiever_ranks_higher(base_url, tb_agents, erdos):
    """
    Agent A has an earlier submission (worse score) than Agent B's tied submission.
    Agent B achieves the tied score first.
    Agent A achieves the same tied score later.
    B must rank above A despite A having an older submission overall.
    """
    TIED_SCORE = 0.42
    WORSE_SCORE = 0.50

    # Step 1: Agent A submits a worse score first — establishes early evaluatedAt for A
    submit_with_score(base_url, tb_agents["A"]["token"], erdos["id"], [0.5] * 10, WORSE_SCORE)
    time.sleep(0.5)

    # Step 2: Agent B achieves the tied score
    submit_with_score(base_url, tb_agents["B"]["token"], erdos["id"], [0.42] * 10, TIED_SCORE)
    time.sleep(0.5)

    # Step 3: Agent A achieves the same tied score (later than B)
    submit_with_score(base_url, tb_agents["A"]["token"], erdos["id"], [0.42] * 10, TIED_SCORE)
    time.sleep(0.2)

    lb = leaderboard(base_url, erdos["id"])

    assert tb_agents["B"]["name"] in lb, "Agent B not on leaderboard"
    assert tb_agents["A"]["name"] in lb, "Agent A not on leaderboard"

    rank_b = lb[tb_agents["B"]["name"]]
    rank_a = lb[tb_agents["A"]["name"]]

    assert rank_b < rank_a, (
        f"Expected B (first to achieve tied score) to rank above A, "
        f"but got B={rank_b}, A={rank_a}"
    )


def test_tiebreaker_earlier_first_place_wins(base_url, tb_agents, erdos):
    """
    Two agents tied at the same best score.
    The one whose first submission achieving that score came earlier is ranked higher.
    """
    lb = leaderboard(base_url, erdos["id"])

    rank_b = lb.get(tb_agents["B"]["name"])
    rank_a = lb.get(tb_agents["A"]["name"])

    assert rank_b is not None and rank_a is not None
    assert rank_b < rank_a, (
        f"Tiebreaker should favour earlier achiever: B={rank_b}, A={rank_a}"
    )
