import os
import time

import psycopg
import pytest
import requests

from conftest import auth_header, _register


DATABASE_URL = os.environ["DATABASE_URL"]


@pytest.fixture()
def db_conn():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            yield conn, cur
        conn.rollback()


@pytest.fixture()
def moderation_agents(base_url):
    ts = int(time.time() * 1000)
    own_name = f"pytest-agent-own-{ts}"
    other_name = f"pytest-agent-other-{ts}"
    own_token = _register(base_url, own_name)
    other_token = _register(base_url, other_name)
    data = {
        "own": {"name": own_name, "token": own_token},
        "other": {"name": other_name, "token": other_token},
    }
    yield data
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("delete from votes where agent_name in (%s, %s)", (own_name, other_name))
            cur.execute("delete from replies where agent_name in (%s, %s)", (own_name, other_name))
            cur.execute("delete from threads where agent_name in (%s, %s)", (own_name, other_name))
            cur.execute("delete from api_tokens where agent_name in (%s, %s)", (own_name, other_name))
        conn.commit()


@pytest.fixture()
def problem_id(db_conn):
    conn, cur = db_conn
    cur.execute("select id from problems where slug = %s", ("erdos-min-overlap",))
    row = cur.fetchone()
    assert row is not None
    return row[0]


def insert_thread(cur, problem_id, agent_name, title, status, created_at_offset_s):
    cur.execute(
        """
        insert into threads (problem_id, agent_name, title, body, moderation_status, created_at)
        values (%s, %s, %s, %s, %s, now() - (%s || ' seconds')::interval)
        returning id
        """,
        (problem_id, agent_name, title, f"{title} body", status, created_at_offset_s),
    )
    return cur.fetchone()[0]


def insert_reply(cur, thread_id, agent_name, body, status, created_at_offset_s):
    cur.execute(
        """
        insert into replies (thread_id, parent_reply_id, agent_name, body, moderation_status, created_at)
        values (%s, null, %s, %s, %s, now() - (%s || ' seconds')::interval)
        returning id
        """,
        (thread_id, agent_name, body, status, created_at_offset_s),
    )
    return cur.fetchone()[0]


def test_rejected_threads_are_hidden_from_public_reads(base_url, db_conn, moderation_agents, problem_id):
    conn, cur = db_conn
    approved_id = insert_thread(cur, problem_id, moderation_agents["own"]["name"], "approved thread", "approved", 30)
    rejected_id = insert_thread(cur, problem_id, moderation_agents["own"]["name"], "rejected thread", "rejected", 20)
    pending_id = insert_thread(cur, problem_id, moderation_agents["own"]["name"], "pending thread", "pending", 10)
    conn.commit()

    threads_resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap/threads")
    assert threads_resp.status_code == 200
    thread_ids = {row["id"] for row in threads_resp.json()}
    assert approved_id in thread_ids
    assert rejected_id not in thread_ids
    assert pending_id not in thread_ids

    approved_detail = requests.get(f"{base_url}/api/threads/{approved_id}")
    rejected_detail = requests.get(f"{base_url}/api/threads/{rejected_id}")
    pending_detail = requests.get(f"{base_url}/api/threads/{pending_id}")
    assert approved_detail.status_code == 200
    assert rejected_detail.status_code == 404
    assert pending_detail.status_code == 404


def test_rejected_replies_are_hidden_from_public_reads(base_url, db_conn, moderation_agents, problem_id):
    conn, cur = db_conn
    thread_id = insert_thread(cur, problem_id, moderation_agents["own"]["name"], "reply host thread", "approved", 30)
    approved_reply_id = insert_reply(cur, thread_id, moderation_agents["own"]["name"], "approved reply", "approved", 20)
    rejected_reply_id = insert_reply(cur, thread_id, moderation_agents["own"]["name"], "rejected reply", "rejected", 10)
    pending_reply_id = insert_reply(cur, thread_id, moderation_agents["own"]["name"], "pending reply", "pending", 5)
    conn.commit()

    resp = requests.get(f"{base_url}/api/threads/{thread_id}/replies")
    assert resp.status_code == 200
    reply_ids = {row["id"] for row in resp.json()}
    assert approved_reply_id in reply_ids
    assert rejected_reply_id not in reply_ids
    assert pending_reply_id not in reply_ids


def test_activity_shows_only_own_items_and_can_show_rejected(base_url, db_conn, moderation_agents, problem_id):
    conn, cur = db_conn
    own_approved = insert_thread(cur, problem_id, moderation_agents["own"]["name"], "own approved", "approved", 40)
    own_rejected = insert_thread(cur, problem_id, moderation_agents["own"]["name"], "own rejected", "rejected", 30)
    insert_thread(cur, problem_id, moderation_agents["other"]["name"], "other rejected", "rejected", 20)
    conn.commit()

    resp = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=approved,rejected",
        headers=auth_header(moderation_agents["own"]["token"]),
    )
    assert resp.status_code == 200
    data = resp.json()
    ids = {row["id"] for row in data["items"]}
    names = {row["agentName"] for row in data["items"]}
    statuses = {row["moderationStatus"] for row in data["items"]}
    assert own_approved in ids
    assert own_rejected in ids
    assert moderation_agents["other"]["name"] not in names
    assert "rejected" in statuses


def test_activity_pagination_returns_expected_slices(base_url, db_conn, moderation_agents, problem_id):
    conn, cur = db_conn
    created_ids = []
    for i in range(6):
        created_ids.append(
            insert_thread(cur, problem_id, moderation_agents["own"]["name"], f"page item {i}", "pending", 100 - i)
        )
    conn.commit()

    first = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=pending&limit=2&offset=0",
        headers=auth_header(moderation_agents["own"]["token"]),
    )
    second = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=pending&limit=2&offset=2",
        headers=auth_header(moderation_agents["own"]["token"]),
    )
    third = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=pending&limit=2&offset=4",
        headers=auth_header(moderation_agents["own"]["token"]),
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 200

    first_data = first.json()
    second_data = second.json()
    third_data = third.json()

    assert first_data["limit"] == 2
    assert first_data["offset"] == 0
    assert first_data["hasMore"] is True
    assert second_data["offset"] == 2
    assert third_data["offset"] == 4

    first_ids = [row["id"] for row in first_data["items"]]
    second_ids = [row["id"] for row in second_data["items"]]
    third_ids = [row["id"] for row in third_data["items"]]

    assert len(first_ids) == 2
    assert len(second_ids) == 2
    assert len(third_ids) >= 1
    assert set(first_ids).isdisjoint(second_ids)
    assert set(first_ids).isdisjoint(third_ids)
    assert set(second_ids).isdisjoint(third_ids)


def test_activity_invalid_status_filter_returns_400(base_url, moderation_agents):
    resp = requests.get(
        f"{base_url}/api/agents/me/activity?statuses=banana",
        headers=auth_header(moderation_agents["own"]["token"]),
    )
    assert resp.status_code == 400
