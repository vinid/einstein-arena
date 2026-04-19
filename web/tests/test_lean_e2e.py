"""
End-to-end test for the Lean proof evaluation pipeline via HTTP.

Submits 4 solutions to the local `lean-sum-test` problem, triggers the
evaluate cron, then polls until all 4 are resolved and asserts their outcomes.

The submissions use the structured schema (answer_expr + proof) that the
verifier wraps into a trusted Lean module per `lean-sum-test.ts`:

    def sum_formula_answer (n : ℕ) : ℕ := {{answer_expr}}

    theorem sum_formula (n : ℕ) :
        2 * ∑ i ∈ Finset.range (n + 1), i = sum_formula_answer n := by
      {{proof}}

Requirements:
  - Next.js dev server running at BASE_URL (default http://localhost:3000)
  - Local DB seeded with `lean-sum-test` problem (run setup once with
    npm run db:seed or the tsx seed script)

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

# Each case submits structured fields conforming to lean-sum-test's zodSchema:
#   { answer_expr: str, proof: str, extra_imports?: list[str] }
# The server plugs these into the problem's LEAN_TEMPLATE before compiling.
PROOFS = {
    # Correct answer n*(n+1), proved by induction.
    "valid": {
        "solution": {
            "answer_expr": "n * (n + 1)",
            "proof": (
                "show 2 * ∑ i ∈ Finset.range (n + 1), i = n * (n + 1)\n"
                "induction n with\n"
                "| zero => simp\n"
                "| succ n ih =>\n"
                "  rw [Finset.sum_range_succ, mul_add, ih]\n"
                "  ring"
            ),
        },
        "expect_status": "evaluated",
        "expect_score": 1,
        "expect_error_contains": None,
    },
    # Truncated `rw [...,` — must fail Lean compilation.
    "invalid": {
        "solution": {
            "answer_expr": "n * (n + 1)",
            "proof": (
                "show 2 * ∑ i ∈ Finset.range (n + 1), i = n * (n + 1)\n"
                "induction n with\n"
                "| zero => simp\n"
                "| succ n ih =>\n"
                "  rw [Finset.sum_range_succ, mul_add,\n"
                "  ring"
            ),
        },
        "expect_status": "error",
        "expect_score": None,
        "expect_error_contains": "compilation_error",
    },
    # Wrong answer n^2 "proved" via sorry. Module compiles (sorry is a
    # warning, not an error) but the axiom audit catches `sorryAx`, which
    # is not in the default allowed-axioms set.
    "sorry": {
        "solution": {
            "answer_expr": "n ^ 2",
            "proof": "sorry",
        },
        "expect_status": "error",
        "expect_score": None,
        "expect_error_contains": "sorry",
    },
    # Self-referential answer: plug the LHS expression back into the answer
    # slot. Module compiles fine and the exact-shape check passes, but
    # `Finset.sum` appears in the elaborated answer definition and is
    # listed in forbiddenAnswerConsts. The forbidden-refs audit fires
    # before the anti-triviality check and must reject this.
    "forbidden_ref": {
        "solution": {
            "answer_expr": "2 * ∑ i ∈ Finset.range (n + 1), i",
            "proof": "rfl",
        },
        "expect_status": "error",
        "expect_score": None,
        "expect_error_contains": "forbidden_answer_refs",
    },
}


def get_problem_id() -> int:
    r = requests.get(f"{BASE_URL}/api/problems")
    assert r.status_code == 200, f"GET /api/problems failed: {r.text}"
    for p in r.json():
        if p["slug"] == PROBLEM_SLUG:
            return p["id"]
    pytest.fail(f"Problem '{PROBLEM_SLUG}' not found — did you seed the local DB?")


def submit_solution(problem_id: int, solution: dict) -> int:
    r = requests.post(
        f"{BASE_URL}/api/solutions",
        json={"problem_id": problem_id, "solution": solution},
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
    for name, case in PROOFS.items():
        sid = submit_solution(problem_id, case["solution"])
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
    # Either "bad_axioms: sorryAx" (caught by axiom audit) or the final
    # "proof uses sorry" verdict — both contain "sorry".
    assert r["error"] and "sorry" in r["error"].lower(), f"unexpected error: {r['error']}"


def test_forbidden_ref_rejected(results):
    r = results["forbidden_ref"]
    assert r["status"] == "error", f"expected error, got {r['status']}"
    assert r["error"] and "forbidden_answer_refs" in r["error"], f"unexpected error: {r['error']}"
