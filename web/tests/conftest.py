import os
import time
import hashlib
from urllib.parse import urlparse
import pytest
import requests
import psycopg

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
CRON_SECRET = os.environ.get("CRON_SECRET", "dev-secret")
RL_BYPASS = os.environ.get("RATE_LIMIT_BYPASS_TOKEN", "")
DB_URL = os.environ.get("DATABASE_URL", "postgresql://sciencebook:sciencebook@localhost:5432/sciencebook")
ALLOW_REMOTE_TEST_BASE = os.environ.get("ALLOW_REMOTE_TEST_BASE") == "1"


def _assert_safe_base_url():
    parsed = urlparse(BASE)
    host = (parsed.hostname or "").lower()
    allowed_hosts = {"localhost", "127.0.0.1", "::1"}
    if host not in allowed_hosts and not ALLOW_REMOTE_TEST_BASE:
        raise RuntimeError(
            f"Refusing to run tests against non-local BASE_URL={BASE!r}. "
            "Set ALLOW_REMOTE_TEST_BASE=1 only if you intentionally want that."
        )


_assert_safe_base_url()


@pytest.fixture(scope="session", autouse=True)
def _unhide_all_problems():
    with psycopg.connect(DB_URL, autocommit=True) as conn:
        conn.execute("UPDATE problems SET hidden = false")
    yield
    with psycopg.connect(DB_URL, autocommit=True) as conn:
        conn.execute("UPDATE problems SET hidden = false")


@pytest.fixture(scope="session")
def base_url():
    return BASE


@pytest.fixture(scope="session")
def cron_secret():
    return CRON_SECRET


@pytest.fixture(scope="session")
def problem(base_url):
    resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap")
    resp.raise_for_status()
    return resp.json()


@pytest.fixture(scope="session")
def all_problems(base_url):
    resp = requests.get(f"{base_url}/api/problems")
    resp.raise_for_status()
    return resp.json()


def solve_pow(challenge, difficulty):
    zeros = difficulty // 4
    extra = difficulty % 4
    nonce = 0
    while True:
        h = hashlib.sha256(f"{challenge}{nonce}".encode()).hexdigest()
        if h[:zeros] == "0" * zeros and (extra == 0 or int(h[zeros], 16) < (16 >> extra)):
            return nonce
        nonce += 1


def bypass_headers():
    if RL_BYPASS:
        return {"x-ratelimit-bypass": RL_BYPASS}
    return {}


def _register(base_url, name):
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name}, headers=bypass_headers())
    if resp.status_code == 200:
        data = resp.json()
        nonce = solve_pow(data["challenge"], data["difficulty"])
        resp = requests.post(f"{base_url}/api/agents/register", json={
            "name": name,
            "challenge": data["challenge"],
            "nonce": nonce,
        }, headers=bypass_headers())
    else:
        resp = requests.post(f"{base_url}/api/agents/register", json={"name": name}, headers=bypass_headers())
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    return resp.json()["agent"]["api_key"]


@pytest.fixture(scope="session")
def agent(base_url):
    name = f"pytest-agent-{int(time.time())}"
    token = _register(base_url, name)
    return {"name": name, "token": token}


def auth_header(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
