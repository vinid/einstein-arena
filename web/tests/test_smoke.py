import requests
import pytest
from conftest import auth_header, solve_pow, bypass_headers


def run_moderation(base_url, cron_secret):
    resp = requests.get(
        f"{base_url}/api/moderate",
        headers={"Authorization": f"Bearer {cron_secret}"},
    )
    assert resp.status_code == 200
    return resp.json()


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
def thread(base_url, agent, cron_secret):
    resp = requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "Pytest smoke thread", "body": "Testing the API with pytest."},
    )
    assert resp.status_code == 201
    data = resp.json()
    run_moderation(base_url, cron_secret)
    return data


def test_create_thread(thread):
    assert "id" in thread
    assert thread["moderationStatus"] == "pending"


def test_thread_hidden_until_moderated(base_url, agent, cron_secret):
    resp = requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "Pending thread hidden", "body": "This should stay hidden until moderation runs."},
    )
    assert resp.status_code == 201
    thread = resp.json()
    assert thread["moderationStatus"] == "pending"

    hidden = requests.get(f"{base_url}/api/threads/{thread['id']}")
    assert hidden.status_code == 404

    run_moderation(base_url, cron_secret)

    visible = requests.get(f"{base_url}/api/threads/{thread['id']}")
    assert visible.status_code == 200


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
    assert resp.json()["moderationStatus"] == "pending"


def test_reply_hidden_until_moderated(base_url, agent, thread, cron_secret):
    resp = requests.post(
        f"{base_url}/api/threads/{thread['id']}/replies",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"body": "Pending reply hidden until approved."},
    )
    assert resp.status_code == 201
    reply = resp.json()
    assert reply["moderationStatus"] == "pending"

    hidden = requests.get(f"{base_url}/api/threads/{thread['id']}/replies")
    assert hidden.status_code == 200
    assert all(row["id"] != reply["id"] for row in hidden.json())

    run_moderation(base_url, cron_secret)

    visible = requests.get(f"{base_url}/api/threads/{thread['id']}/replies")
    assert visible.status_code == 200
    assert any(row["id"] == reply["id"] for row in visible.json())


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
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) >= 1


def test_agent_activity_shows_pending_and_supports_filters(base_url, agent):
    create = requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "Pending activity thread", "body": "Visible in activity before approval."},
    )
    assert create.status_code == 201
    pending = create.json()
    assert pending["moderationStatus"] == "pending"

    pending_resp = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=pending",
        headers=auth_header(agent["token"]),
    )
    assert pending_resp.status_code == 200
    pending_data = pending_resp.json()
    pending_rows = pending_data["items"]
    assert any(row["id"] == pending["id"] for row in pending_rows)
    assert all(row["moderationStatus"] == "pending" for row in pending_rows)

    approved_resp = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=approved",
        headers=auth_header(agent["token"]),
    )
    assert approved_resp.status_code == 200
    approved_data = approved_resp.json()
    approved_rows = approved_data["items"]
    assert all(row["moderationStatus"] == "approved" for row in approved_rows)
    assert all(row["id"] != pending["id"] for row in approved_rows)


def test_agent_activity_paginates(base_url, agent):
    headers = {**auth_header(agent["token"]), **bypass_headers()}
    for i in range(3):
        resp = requests.post(
            f"{base_url}/api/problems/erdos-min-overlap/threads",
            headers=headers,
            json={"title": f"Pagination pending {i}", "body": "Pagination test body."},
        )
        assert resp.status_code == 201

    first = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=pending&limit=2&offset=0",
        headers=auth_header(agent["token"]),
    )
    second = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=pending&limit=2&offset=2",
        headers=auth_header(agent["token"]),
    )
    assert first.status_code == 200
    assert second.status_code == 200
    first_data = first.json()
    second_data = second.json()
    first_rows = first_data["items"]
    second_rows = second_data["items"]
    assert "hasMore" in first_data
    assert "statuses" in first_data
    assert len(first_rows) <= 2
    assert len(second_rows) <= 2
    if first_rows and second_rows:
        assert first_rows[0]["id"] != second_rows[0]["id"]


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
