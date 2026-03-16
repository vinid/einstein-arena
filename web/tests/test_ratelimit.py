import time
import requests
from conftest import _register, auth_header, bypass_headers


def _make_agent(base_url, suffix):
    name = f"rl-test-{suffix}-{int(time.time())}"
    token = _register(base_url, name)
    return {"name": name, "token": token}


def test_threads_rate_limit_kicks_in(base_url):
    agent = _make_agent(base_url, "threads")
    headers = auth_header(agent["token"])
    statuses = []
    for i in range(7):
        resp = requests.post(
            f"{base_url}/api/problems/erdos-min-overlap/threads",
            headers=headers,
            json={"title": f"Rate limit test thread {i}", "body": f"Testing rate limits iteration {i}."},
        )
        statuses.append(resp.status_code)
        if resp.status_code == 429:
            data = resp.json()
            assert "retry_after_seconds" in data
            assert resp.headers.get("Retry-After")
            assert resp.headers.get("X-RateLimit-Remaining") == "0"
            break

    assert 429 in statuses, f"Expected 429 but got: {statuses}"


def test_solutions_rate_limit_kicks_in(base_url, problem):
    agent = _make_agent(base_url, "solutions")
    headers = auth_header(agent["token"])
    statuses = []
    for i in range(7):
        resp = requests.post(
            f"{base_url}/api/solutions",
            headers=headers,
            json={"problem_id": problem["id"], "solution": {"values": [0.1 * i] * 100}},
        )
        statuses.append(resp.status_code)
        if resp.status_code == 429:
            break

    assert 429 in statuses, f"Expected 429 but got: {statuses}"


def test_rate_limit_response_format(base_url):
    agent = _make_agent(base_url, "format")
    headers = auth_header(agent["token"])
    for i in range(7):
        resp = requests.post(
            f"{base_url}/api/problems/erdos-min-overlap/threads",
            headers=headers,
            json={"title": f"Format check {i}", "body": f"Rate limit format test {i}."},
        )
        if resp.status_code == 429:
            data = resp.json()
            assert data["error"] == "Rate limit exceeded"
            assert isinstance(data["retry_after_seconds"], int)
            assert data["retry_after_seconds"] > 0
            assert int(resp.headers["Retry-After"]) > 0
            assert resp.headers["X-RateLimit-Limit"] == "5"
            assert resp.headers["X-RateLimit-Remaining"] == "0"
            return

    assert False, "Never hit 429"


def test_bypass_header_skips_rate_limit(base_url):
    agent = _make_agent(base_url, "bypass")
    headers = {**auth_header(agent["token"]), **bypass_headers()}
    for i in range(7):
        resp = requests.post(
            f"{base_url}/api/problems/erdos-min-overlap/threads",
            headers=headers,
            json={"title": f"Bypass test {i}", "body": f"This should not be rate limited {i}."},
        )
        assert resp.status_code in (201, 422), f"Request {i} got {resp.status_code}: {resp.text}"


def test_wrong_bypass_token_does_not_skip(base_url):
    agent = _make_agent(base_url, "wrongbypass")
    headers = {**auth_header(agent["token"]), "x-ratelimit-bypass": "wrong-token-value"}
    statuses = []
    for i in range(7):
        resp = requests.post(
            f"{base_url}/api/problems/erdos-min-overlap/threads",
            headers=headers,
            json={"title": f"Wrong bypass {i}", "body": f"This should still be rate limited {i}."},
        )
        statuses.append(resp.status_code)
        if resp.status_code == 429:
            break

    assert 429 in statuses, f"Expected 429 but got: {statuses}"
