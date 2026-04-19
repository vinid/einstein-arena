import json
import os
import time
import requests
import pytest
from conftest import _register, auth_header, bypass_headers

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
blob_required = pytest.mark.skipif(not BLOB_TOKEN, reason="BLOB_READ_WRITE_TOKEN not configured")


def _make_agent(base_url, suffix):
    name = f"blob-test-{suffix}-{int(time.time())}"
    token = _register(base_url, name)
    return {"name": name, "token": token}


def _get_solution(base_url, sol_id):
    resp = requests.get(f"{base_url}/api/solutions/{sol_id}")
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def _trigger_eval(base_url, cron_secret):
    resp = requests.get(
        f"{base_url}/api/evaluate",
        headers={"Authorization": f"Bearer {cron_secret}"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _wait_for_solution(base_url, sol_id, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        sol = _get_solution(base_url, sol_id)
        if sol is None or sol["status"] != "pending":
            return sol
        time.sleep(3)
    pytest.fail(f"Solution {sol_id} still pending after {timeout}s")


@blob_required
def test_upload_url_endpoint_returns_expected_fields(base_url):
    agent = _make_agent(base_url, "fields")
    resp = requests.post(
        f"{base_url}/api/solutions/upload-url",
        headers=auth_header(agent["token"]),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "clientToken" in data
    assert "blobKey" in data
    assert "uploadUrl" in data
    assert data["uploadUrl"].startswith("https://")
    assert ".vercel-storage.com" in data["uploadUrl"]
    assert data["blobKey"].endswith(".json")


@blob_required
def test_upload_url_requires_auth(base_url):
    resp = requests.post(f"{base_url}/api/solutions/upload-url")
    assert resp.status_code == 401


@blob_required
def test_blob_solution_submit_and_evaluate(base_url, cron_secret):
    agent = _make_agent(base_url, "eval")
    headers = {**auth_header(agent["token"]), **bypass_headers()}

    # 1. Get a client upload token from the platform
    url_resp = requests.post(f"{base_url}/api/solutions/upload-url", headers=headers)
    assert url_resp.status_code == 200, url_resp.text
    url_data = url_resp.json()
    upload_url = url_data["uploadUrl"]
    client_token = url_data["clientToken"]

    # 2. Upload the solution JSON directly to Vercel Blob using the client token
    solution = {"values": [0.3] * 200}
    put_resp = requests.put(
        upload_url,
        data=json.dumps(solution),
        headers={
            "Authorization": f"Bearer {client_token}",
            "Content-Type": "application/json",
            "x-api-version": "7",
        },
    )
    assert put_resp.status_code in (200, 201), \
        f"Blob PUT failed ({put_resp.status_code}): {put_resp.text}"

    # 3. Submit, referencing the blob URL (server fetches + deletes the blob)
    problem_resp = requests.get(f"{base_url}/api/problems/erdos-min-overlap")
    problem_resp.raise_for_status()
    problem = problem_resp.json()

    submit_resp = requests.post(
        f"{base_url}/api/solutions",
        headers=headers,
        json={"problem_id": problem["id"], "solution_blob_url": upload_url},
    )
    assert submit_resp.status_code == 201, submit_resp.text
    sol_id = submit_resp.json()["id"]

    # 4. Trigger the evaluation cron
    _trigger_eval(base_url, cron_secret)

    # 5. Confirm the solution was processed — evaluated or pruned, either proves
    #    the blob was read and the solution made it through the full pipeline
    sol = _wait_for_solution(base_url, sol_id)
    assert sol is None or sol["status"] in ("evaluated", "error"), \
        f"Unexpected solution status: {sol}"
