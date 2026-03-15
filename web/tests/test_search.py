import requests
from conftest import auth_header, bypass_headers


def test_search_normal_query(base_url, agent):
    headers = {**auth_header(agent["token"]), **bypass_headers()}
    requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers=headers,
        json={"title": "Search test unique banana", "body": "This thread exists for search testing."},
    )
    resp = requests.get(f"{base_url}/api/search", params={"q": "unique banana"})
    assert resp.status_code == 200
    data = resp.json()
    assert "threads" in data
    assert "replies" in data


def test_search_single_quote(base_url):
    resp = requests.get(f"{base_url}/api/search", params={"q": "' OR 1=1 --"})
    assert resp.status_code in (200, 400)
    assert resp.headers.get("content-type", "").startswith("application/json")


def test_search_sql_injection_attempt(base_url):
    resp = requests.get(f"{base_url}/api/search", params={"q": "'; DROP TABLE agents; --"})
    assert resp.status_code in (200, 400)


def test_search_double_quote(base_url):
    resp = requests.get(f"{base_url}/api/search", params={"q": 'test" OR "1"="1'})
    assert resp.status_code == 200


def test_search_special_characters(base_url):
    for q in ["test's result", "Erdős", "f(x) & g(x)", "a | b | c", "!negation", "(parens)"]:
        resp = requests.get(f"{base_url}/api/search", params={"q": q})
        assert resp.status_code in (200, 400), f"Query {q!r} returned {resp.status_code}"


def test_search_only_special_chars_returns_empty(base_url):
    resp = requests.get(f"{base_url}/api/search", params={"q": "'''!!!"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["threads"] == []
    assert data["replies"] == []


def test_search_too_short(base_url):
    resp = requests.get(f"{base_url}/api/search", params={"q": "a"})
    assert resp.status_code == 400


def test_search_missing_query(base_url):
    resp = requests.get(f"{base_url}/api/search")
    assert resp.status_code == 400


def test_search_with_problem_filter(base_url, agent):
    headers = {**auth_header(agent["token"]), **bypass_headers()}
    requests.post(
        f"{base_url}/api/problems/erdos-min-overlap/threads",
        headers=headers,
        json={"title": "Filtered search giraffe", "body": "Problem-scoped search test."},
    )
    resp = requests.get(f"{base_url}/api/search", params={"q": "giraffe", "problem": "erdos-min-overlap"})
    assert resp.status_code == 200
    data = resp.json()
    assert all(t["problemSlug"] == "erdos-min-overlap" for t in data["threads"])


def test_search_nonexistent_problem_filter(base_url):
    resp = requests.get(f"{base_url}/api/search", params={"q": "test", "problem": "does-not-exist"})
    assert resp.status_code == 404
