"""
End-to-end test for the Lean proof evaluation pipeline via HTTP.

Submits 4 solutions to the local `lean-sum-test` problem, triggers the
evaluate cron, then polls until all 4 are resolved and asserts their outcomes.

Requirements:
  - Next.js dev server running at BASE_URL (default http://localhost:3000)
  - Local DB seeded with `lean-sum-test` problem (run setup once with npm run db:seed or the tsx seed script)

Run:
  pytest tests/test_lean_e2e.py -v -s
"""

import time
import requests
import pytest

BASE_URL = "http://localhost:3000"
AGENT_TOKEN = "ea_lean_e2e_test_token_local_only"
CRON_SECRET = "dev-secret"
BYPASS_TOKEN = "test-bypass-token-local"
PROBLEM_SLUG = "lean-sum-test"
POLL_INTERVAL = 5
POLL_TIMEOUT = 300

AUTH = {"Authorization": f"Bearer {AGENT_TOKEN}"}
BYPASS = {"Authorization": f"Bearer {AGENT_TOKEN}", "x-ratelimit-bypass": BYPASS_TOKEN}
CRON = {"Authorization": f"Bearer {CRON_SECRET}"}

PROOFS = {
    "valid": {
        "lean_code": (
            "import FormalConjectures.Util.ProblemImports\n"
            "theorem sum_formula (n : ℕ) :\n"
            "    2 * ∑ i ∈ Finset.range (n + 1), i = answer(n * (n + 1)) := by\n"
            "  show 2 * ∑ i ∈ Finset.range (n + 1), i = n * (n + 1)\n"
            "  induction n with\n"
            "  | zero => simp\n"
            "  | succ n ih =>\n"
            "    rw [Finset.sum_range_succ, mul_add, ih]\n"
            "    ring"
        ),
        "expect_score": 1,
        "expect_status": "evaluated",
    },
    "invalid": {
        "lean_code": (
            "import FormalConjectures.Util.ProblemImports\n"
            "theorem sum_formula (n : ℕ) :\n"
            "    2 * ∑ i ∈ Finset.range (n + 1), i = answer(n ^ 2 + n) := by\n"
            "  show 2 * ∑ i ∈ Finset.range (n + 1), i = n ^ 2 + n\n"
            "  induction n with\n"
            "  | zero => simp\n"
            "  | succ n ih =>\n"
            "    rw [Finset.sum_range_succ, mul_add,\n"
            "    ring"
        ),
        "expect_score": None,
        "expect_status": "error",
    },
    "sorry": {
        "lean_code": (
            "import FormalConjectures.Util.ProblemImports\n"
            "theorem sum_formula (n : ℕ) :\n"
            "    2 * ∑ i ∈ Finset.range (n + 1), i = answer(n ^ 2) := by\n"
            "  sorry"
        ),
        "expect_score": None,
        "expect_status": "error",
    },
    "trivial": {
        "lean_code": (
            "import FormalConjectures.Util.ProblemImports\n"
            "theorem sum_formula (n : ℕ) :\n"
            "    2 * ∑ i ∈ Finset.range (n + 1), i =\n"
            "    answer(2 * ∑ i ∈ Finset.range (n + 1), i) := by\n"
            "  rfl"
        ),
        "expect_score": None,
        "expect_status": "error",
    },
}


def get_problem_id() -> int:
    r = requests.get(f"{BASE_URL}/api/problems")
    assert r.status_code == 200, f"GET /api/problems failed: {r.text}"
    for p in r.json():
        if p["slug"] == PROBLEM_SLUG:
            return p["id"]
    pytest.fail(f"Problem '{PROBLEM_SLUG}' not found — did you seed the local DB?")


def submit_solution(problem_id: int, lean_code: str) -> int:
    r = requests.post(
        f"{BASE_URL}/api/solutions",
        json={"problem_id": problem_id, "solution": {"lean_code": lean_code}},
        headers=BYPASS,
    )
    assert r.status_code == 201, f"POST /api/solutions failed: {r.text}"
    return r.json()["id"]


def trigger_evaluate() -> dict:
    r = requests.get(f"{BASE_URL}/api/evaluate", headers=CRON)
    assert r.status_code == 200, f"GET /api/evaluate failed: {r.text}"
    return r.json()


def poll_solutions(sol_ids: list[int]) -> dict[int, dict]:
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers={"x-admin-secret": "dev-admin"})
        assert r.status_code == 200
        recent = {s["id"]: s for s in r.json()["recentSolutions"] if s["id"] in sol_ids}
        if all(recent.get(sid, {}).get("status") in ("evaluated", "error") for sid in sol_ids):
            return recent
        time.sleep(POLL_INTERVAL)
    pytest.fail(f"Solutions did not resolve within {POLL_TIMEOUT}s")


@pytest.fixture(scope="module")
def results() -> dict[str, dict]:
    problem_id = get_problem_id()
    print(f"\nUsing problem_id={problem_id}")

    sol_ids: dict[str, int] = {}
    for name, proof in PROOFS.items():
        sid = submit_solution(problem_id, proof["lean_code"])
        sol_ids[name] = sid
        print(f"  Submitted {name} → solution id={sid}")

    print("Triggering evaluate...")
    ev = trigger_evaluate()
    print(f"  evaluate response: {ev}")
    if ev.get("skipped"):
        pytest.fail("Evaluate was skipped (lock held) — wait and retry")

    print(f"Polling for results (timeout={POLL_TIMEOUT}s)...")
    by_id = poll_solutions(list(sol_ids.values()))

    return {name: by_id[sid] for name, sid in sol_ids.items()}


def test_valid_proof_accepted(results):
    r = results["valid"]
    assert r["status"] == "evaluated", f"expected evaluated, got {r['status']}: {r.get('error')}"
    assert r["score"] == 1, f"expected score=1, got {r['score']}"


def test_invalid_lean_rejected(results):
    r = results["invalid"]
    assert r["status"] == "error", f"expected error, got {r['status']}"
    assert r["error"] and "compilation_error" in r["error"], f"unexpected error: {r['error']}"


def test_sorry_proof_rejected(results):
    r = results["sorry"]
    assert r["status"] == "error", f"expected error, got {r['status']}"
    assert r["error"] == "proof uses sorry", f"unexpected error: {r['error']}"


def test_trivial_proof_rejected(results):
    r = results["trivial"]
    assert r["status"] == "error", f"expected error, got {r['status']}"
    assert r["error"] == "trivial self-referential answer", f"unexpected error: {r['error']}"
