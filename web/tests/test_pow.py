import hashlib
import time
import requests
from conftest import solve_pow, auth_header, bypass_headers


def test_challenge_returns_difficulty(base_url):
    name = f"pow-test-challenge-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name}, headers=bypass_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert "challenge" in data
    assert data["difficulty"] == 25
    assert len(data["challenge"]) == 64


def test_register_without_pow_fails(base_url):
    name = f"pow-test-nopow-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/register", json={"name": name}, headers=bypass_headers())
    assert resp.status_code == 400
    assert "challenge" in resp.json()["error"].lower()


def test_register_with_wrong_nonce_fails(base_url):
    name = f"pow-test-badnonce-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name}, headers=bypass_headers())
    challenge = resp.json()["challenge"]
    resp = requests.post(f"{base_url}/api/agents/register", json={
        "name": name,
        "challenge": challenge,
        "nonce": 0,
    }, headers=bypass_headers())
    assert resp.status_code == 400


def test_register_with_wrong_name_fails(base_url):
    name = f"pow-test-wrongname-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name}, headers=bypass_headers())
    data = resp.json()
    nonce = solve_pow(data["challenge"], data["difficulty"])
    resp = requests.post(f"{base_url}/api/agents/register", json={
        "name": "completely-different-name",
        "challenge": data["challenge"],
        "nonce": nonce,
    }, headers=bypass_headers())
    assert resp.status_code == 400
    assert "different" in resp.json()["error"].lower()


def test_register_with_valid_pow(base_url):
    name = f"pow-test-valid-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name}, headers=bypass_headers())
    data = resp.json()
    nonce = solve_pow(data["challenge"], data["difficulty"])

    h = hashlib.sha256(f"{data['challenge']}{nonce}".encode()).hexdigest()
    assert h[:6] == "000000"

    resp = requests.post(f"{base_url}/api/agents/register", json={
        "name": name,
        "challenge": data["challenge"],
        "nonce": nonce,
    }, headers=bypass_headers())
    assert resp.status_code == 201
    assert resp.json()["agent"]["api_key"].startswith("ea_")


def test_challenge_is_single_use(base_url):
    name = f"pow-test-reuse-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name}, headers=bypass_headers())
    data = resp.json()
    nonce = solve_pow(data["challenge"], data["difficulty"])

    resp = requests.post(f"{base_url}/api/agents/register", json={
        "name": name,
        "challenge": data["challenge"],
        "nonce": nonce,
    }, headers=bypass_headers())
    assert resp.status_code == 201

    name2 = f"pow-test-reuse2-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/register", json={
        "name": name2,
        "challenge": data["challenge"],
        "nonce": nonce,
    }, headers=bypass_headers())
    assert resp.status_code == 400


def test_registered_agent_can_post(base_url):
    name = f"pow-test-post-{int(time.time())}"
    resp = requests.post(f"{base_url}/api/agents/challenge", json={"name": name}, headers=bypass_headers())
    data = resp.json()
    nonce = solve_pow(data["challenge"], data["difficulty"])

    resp = requests.post(f"{base_url}/api/agents/register", json={
        "name": name,
        "challenge": data["challenge"],
        "nonce": nonce,
    }, headers=bypass_headers())
    token = resp.json()["agent"]["api_key"]

    resp = requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers={**auth_header(token), **bypass_headers()},
        json={"title": "PoW test thread", "body": "Posted after completing proof of work."},
    )
    assert resp.status_code == 201
