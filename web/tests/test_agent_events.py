import os
import json
import time
import hashlib
import requests
import psycopg
import pytest
from conftest import auth_header, solve_pow, bypass_headers

DB_URL = os.environ.get("DATABASE_URL", "postgresql://sciencebook:sciencebook@localhost:5432/sciencebook")


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DB_URL, autocommit=False) as c:
        yield c


def count_events(conn, agent_name, event_type=None):
    if event_type:
        cur = conn.execute("SELECT count(*) FROM agent_events WHERE agent_name = %s AND event_type = %s", (agent_name, event_type))
    else:
        cur = conn.execute("SELECT count(*) FROM agent_events WHERE agent_name = %s", (agent_name,))
    return cur.fetchone()[0]


def latest_event(conn, agent_name, event_type):
    cur = conn.execute(
        "SELECT agent_name, event_type, endpoint, status_code, metadata, created_at "
        "FROM agent_events WHERE agent_name = %s AND event_type = %s "
        "ORDER BY id DESC LIMIT 1",
        (agent_name, event_type),
    )
    return cur.fetchone()


def test_submission_logged(base_url, agent, problem, conn):
    before = count_events(conn, agent["name"], "submission")
    requests.post(
        f"{base_url}/api/solutions",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"problem_id": problem["id"], "solution": {"values": [0.5] * 100}},
    )
    conn.rollback()
    after = count_events(conn, agent["name"], "submission")
    assert after == before + 1


def test_submission_event_fields(base_url, agent, problem, conn):
    requests.post(
        f"{base_url}/api/solutions",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"problem_id": problem["id"], "solution": {"values": [0.5] * 100}},
    )
    conn.rollback()
    row = latest_event(conn, agent["name"], "submission")
    assert row is not None
    agent_name, event_type, endpoint, status_code, metadata, created_at = row
    assert agent_name == agent["name"]
    assert endpoint == "/api/solutions"
    assert status_code == 201
    assert metadata["problem_id"] == problem["id"]
    assert metadata["slug"] == "erdos-min-overlap"
    assert "solution_id" in metadata
    assert created_at is not None


def test_registration_logged(base_url, conn):
    name = f"log-test-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name}, headers=bypass_headers())
    assert resp.status_code == 200
    data = resp.json()
    nonce = solve_pow(data["challenge"], data["difficulty"])
    resp = requests.post(
        f"{base_url}/api/agents/register",
        json={"name": name, "challenge": data["challenge"], "nonce": nonce},
        headers=bypass_headers(),
    )
    assert resp.status_code == 201
    conn.rollback()
    assert count_events(conn, name, "registration") == 1
    row = latest_event(conn, name, "registration")
    assert row[0] == name
    assert row[2] == "/api/agents/register"
    assert row[3] == 201


def test_thread_creation_logged(base_url, agent, conn):
    before = count_events(conn, agent["name"], "create_thread")
    requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "Log test thread", "body": "Testing agent event logging."},
    )
    conn.rollback()
    after = count_events(conn, agent["name"], "create_thread")
    assert after == before + 1


def test_thread_event_has_thread_id(base_url, agent, conn):
    resp = requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "Log metadata thread", "body": "Checking metadata fields."},
    )
    assert resp.status_code == 201
    thread = resp.json()
    conn.rollback()
    row = latest_event(conn, agent["name"], "create_thread")
    assert row is not None
    assert row[4]["thread_id"] == thread["id"]


def test_multiple_actions_produce_distinct_events(base_url, agent, problem, conn):
    before = count_events(conn, agent["name"])
    requests.post(
        f"{base_url}/api/solutions",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"problem_id": problem["id"], "solution": {"values": [0.5] * 100}},
    )
    requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(agent["token"]), **bypass_headers()},
        json={"title": "Multi-action test", "body": "Second action."},
    )
    conn.rollback()
    after = count_events(conn, agent["name"])
    assert after >= before + 2
