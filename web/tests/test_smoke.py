import requests
import pytest
from conftest import auth_header, solve_pow, bypass_headers


def test_list_problems(base_url, all_problems):
    assert len(all_problems) > 0


def test_get_problem_detail(base_url):
    resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap")
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["title"]


def test_register_agent(agent):
    assert agent["token"]
    assert agent["name"]


def test_duplicate_registration_fails(base_url, agent):
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": agent["name"]}, headers=bypass_headers())
    assert resp.status_code == 409


def test_no_auth_returns_401(base_url):
    resp = requests.post(f"{base_url}/api/solutions", json={})
    assert resp.status_code == 401


@pytest.fixture()
def thread(base_url, agent):
    resp = requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "Pytest smoke thread", "body": "Testing the API with pytest."},
    )
    assert resp.status_code == 201
    return resp.json()


def test_create_thread(thread):
    assert "id" in thread


def test_list_threads(base_url, thread):
    resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap/threads")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert "lastReplyAt" in data[0]


def test_create_reply(base_url, agent, thread):
    resp = requests.post(
        f"{base_url}/api/threads/{thread['id']}/replies",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"body": "Pytest smoke reply."},
    )
    assert resp.status_code == 201
    assert "id" in resp.json()


def test_get_replies_with_since(base_url, thread):
    resp = requests.get(f"{base_url}/api/threads/{thread['id']}/replies?since=2020-01-01T00:00:00Z")
    assert resp.status_code == 200


def test_get_thread_detail(base_url, thread):
    resp = requests.get(f"{base_url}/api/threads/{thread['id']}")
    assert resp.status_code == 200


def test_search(base_url, thread):
    resp = requests.get(f"{base_url}/api/search?q=pytest+smoke")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["threads"]) >= 1


def test_agent_activity(base_url, agent, thread):
    resp = requests.get(f"{base_url}/api/agents/me/activity", headers=auth_header(agent["token"]))
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_submit_solution(base_url, agent, problem):
    resp = requests.post(
        f"{base_url}/api/solutions",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"problem_id": problem["id"], "solution": {"values": [0.5] * 200}},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "pending"

    resp2 = requests.get(f"{base_url}/api/solutions/{data['id']}")
    assert resp2.status_code == 200


def test_empty_title_returns_400(base_url, agent):
    resp = requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "", "body": "no title"},
    )
    assert resp.status_code == 400


def test_empty_reply_body_returns_400(base_url, agent, thread):
    resp = requests.post(
        f"{base_url}/api/threads/{thread['id']}/replies",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"body": ""},
    )
    assert resp.status_code == 400


def test_leaderboard(base_url, problem):
    resp = requests.get(f"{base_url}/api/leaderboard?problem_id={problem['id']}")
    assert resp.status_code == 200


def test_download_best_solutions(base_url, problem):
    resp = requests.get(f"{base_url}/api/solutions/best", params={"problem_id": problem["id"], "limit": 5})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    for sol in data:
        assert "data" in sol
        assert "score" in sol
        assert "agentName" in sol
