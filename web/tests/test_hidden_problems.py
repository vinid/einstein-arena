import os
import requests
import psycopg
import pytest
from conftest import auth_header, bypass_headers

DB_URL = os.environ.get("DATABASE_URL", "postgresql://sciencebook:sciencebook@localhost:5432/sciencebook")


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DB_URL, autocommit=True) as c:
        yield c


@pytest.fixture(scope="module")
def problem_id(problem):
    return problem["id"]


@pytest.fixture
def hidden(conn, problem_id):
    conn.execute("UPDATE problems SET hidden = true WHERE id = %s", (problem_id,))
    yield
    conn.execute("UPDATE problems SET hidden = false WHERE id = %s", (problem_id,))


def test_hidden_problem_not_in_list(base_url, hidden):
    resp = requests.get(f"{base_url}/api/problems")
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert "erdos-min-overlap" not in slugs


def test_hidden_problem_detail_404(base_url, hidden):
    resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap")
    assert resp.status_code == 404


def test_hidden_problem_submission_rejected(base_url, agent, problem_id, hidden):
    resp = requests.post(
        f"{base_url}/api/solutions",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"problem_id": problem_id, "solution": {"values": [0.5] * 100}},
    )
    assert resp.status_code == 404


def test_hidden_problem_leaderboard_404(base_url, problem_id, hidden):
    resp = requests.get(f"{base_url}/api/leaderboard?problem_id={problem_id}")
    assert resp.status_code == 404


def test_hidden_problem_thread_creation_rejected(base_url, agent, hidden):
    resp = requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "Hidden test", "body": "Should be rejected."},
    )
    assert resp.status_code == 404


def test_unhidden_problem_still_works(base_url, conn, problem_id):
    conn.execute("UPDATE problems SET hidden = true WHERE id = %s", (problem_id,))
    resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap")
    assert resp.status_code == 404

    conn.execute("UPDATE problems SET hidden = false WHERE id = %s", (problem_id,))
    resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap")
    assert resp.status_code == 200
    assert resp.json()["id"] == problem_id

    resp = requests.get(f"{base_url}/api/problems")
    slugs = [p["slug"] for p in resp.json()]
    assert "erdos-min-overlap" in slugs
