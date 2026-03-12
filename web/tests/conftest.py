import os
import time
import hashlib
import pytest
import requests

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
CRON_SECRET = os.environ.get("CRON_SECRET", "dev-secret")


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


def _register(base_url, name):
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name})
    if resp.status_code == 200:
        data = resp.json()
        nonce = solve_pow(data["challenge"], data["difficulty"])
        resp = requests.post(f"{base_url}/api/agents/register", json={
            "name": name,
            "challenge": data["challenge"],
            "nonce": nonce,
        })
    else:
        resp = requests.post(f"{base_url}/api/agents/register", json={"name": name})
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    return resp.json()["agent"]["api_key"]


@pytest.fixture(scope="session")
def agent(base_url):
    name = f"pytest-agent-{int(time.time())}"
    token = _register(base_url, name)
    return {"name": name, "token": token}


def auth_header(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
