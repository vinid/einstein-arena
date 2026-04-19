"""
Integration tests for the Lean proof verification pipeline.

Exercises `LeanVerifier.verifyStructuredProof` directly (no HTTP / DB)
using the `lean-sum-test` problem definition as the trusted wrapper.

Five cases cover every verification outcome:
  - v1, v2     — two algebraically-equivalent correct answers (score=1)
  - v3         — malformed Lean proof body → compilation_error
  - wrong      — `sorry` used in place of an actual proof → caught
  - forbidden  — self-referential answer that embeds `Finset.sum`
                 → caught by the forbidden-answer-refs audit

Requires:
  E2B_API_KEY          — E2B API key
  LEAN_WARM_SANDBOX_ID — (optional) warm sandbox for faster startup

Run:
  E2B_API_KEY=... LEAN_WARM_SANDBOX_ID=... pytest tests/test_lean_verify.py -v
"""

import json
import os
import subprocess
from pathlib import Path

import pytest


def _skip_if_no_e2b():
    if not os.environ.get("E2B_API_KEY"):
        pytest.skip("E2B_API_KEY not set — skipping Lean verification tests")


@pytest.fixture(scope="module", autouse=True)
def _require_e2b():
    _skip_if_no_e2b()


# We run all cases in one verifier session to avoid re-creating the
# sandbox for each test. Results are cached in a module-scoped fixture.

# Each case is an (answer_expr, proof) pair. The TS script below wraps each
# one into a StructuredProofInput using the live `lean-sum-test` problem
# definition (imported from src/lib/problems/lean-sum-test.ts), so the test
# stays in sync with the real verifier config as that file evolves.
CASES: dict[str, dict[str, str]] = {
    "v1": {
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
    "v2": {
        "answer_expr": "n ^ 2 + n",
        "proof": (
            "show 2 * ∑ i ∈ Finset.range (n + 1), i = n ^ 2 + n\n"
            "induction n with\n"
            "| zero => simp\n"
            "| succ n ih =>\n"
            "  rw [Finset.sum_range_succ, mul_add, ih]\n"
            "  ring"
        ),
    },
    "v3": {
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
    "wrong": {
        "answer_expr": "n ^ 2",
        "proof": "sorry",
    },
    "forbidden": {
        "answer_expr": "2 * ∑ i ∈ Finset.range (n + 1), i",
        "proof": "rfl",
    },
}


@pytest.fixture(scope="module")
def all_results() -> dict[str, dict]:
    """Run all cases through the structured verifier in a single session."""
    web_dir = Path(__file__).resolve().parent.parent
    cases_json = json.dumps(CASES)

    script = (
        'import { LeanVerifier, type StructuredProofInput } from "./src/lib/lean-verify";\n'
        'import leanSumTest from "./src/lib/problems/lean-sum-test";\n'
        "\n"
        f"const cases: Record<string, {{ answer_expr: string; proof: string }}> = {cases_json};\n"
        "\n"
        "function mkInput(answerExpr: string, proof: string): StructuredProofInput {\n"
        '  return {\n'
        '    proofKind: "formula_proof",\n'
        "    answerExpr,\n"
        "    proof,\n"
        "    leanTemplate: leanSumTest.leanTemplate,\n"
        "    theoremName: leanSumTest.theoremName,\n"
        "    answerName: leanSumTest.answerName,\n"
        "    exactVerifier: leanSumTest.exactVerifier,\n"
        "    forbiddenAnswerConsts: leanSumTest.forbiddenAnswerConsts,\n"
        "    allowedAxioms: leanSumTest.allowedAxioms,\n"
        "    allowedImportPrefixes: leanSumTest.allowedImportPrefixes,\n"
        "    antitrivial: leanSumTest.antitrivial,\n"
        "  };\n"
        "}\n"
        "\n"
        "(async () => {\n"
        "  const v = new LeanVerifier();\n"
        "  await v.init();\n"
        "  const results: Record<string, unknown> = {};\n"
        "  try {\n"
        "    for (const [key, c] of Object.entries(cases)) {\n"
        "      results[key] = await v.verifyStructuredProof(mkInput(c.answer_expr, c.proof));\n"
        "    }\n"
        '    process.stdout.write("RESULT:" + JSON.stringify(results));\n'
        "  } finally {\n"
        "    await v.close();\n"
        "  }\n"
        "})();\n"
    )

    result = subprocess.run(
        ["npx", "tsx", "--eval", script],
        capture_output=True,
        text=True,
        timeout=600,
        cwd=str(web_dir),
    )
    if result.returncode != 0:
        pytest.fail(f"tsx failed:\nstdout: {result.stdout[:500]}\nstderr: {result.stderr[:500]}")

    for line in result.stdout.strip().splitlines():
        line = line.strip()
        if line.startswith("RESULT:"):
            return json.loads(line[len("RESULT:"):])

    pytest.fail(f"No RESULT: output from verifier.\nstdout: {result.stdout[:1000]}")


# ---------------------------------------------------------------------------
# Tests — correct proofs
# ---------------------------------------------------------------------------

def test_correct_proof_v1_accepted(all_results):
    """Correct proof with answer n*(n+1) should score 1."""
    r = all_results["v1"]
    assert r["score"] == 1, f"unexpected failure: {r.get('error')}"
    assert r["details"]["user_ok"] is True
    assert r["details"]["exact_ok"] is True
    assert r["details"]["axioms_ok"] is True
    assert r["details"]["answer_ok"] is True
    assert r["details"]["has_sorry"] is False
    assert r["details"]["is_trivial"] is False


def test_correct_proof_v2_accepted(all_results):
    """Equivalent expression n^2+n should also score 1."""
    r = all_results["v2"]
    assert r["score"] == 1, f"unexpected failure: {r.get('error')}"
    assert r["details"]["user_ok"] is True
    assert r["details"]["exact_ok"] is True
    assert r["details"]["axioms_ok"] is True
    assert r["details"]["answer_ok"] is True
    assert r["details"]["has_sorry"] is False
    assert r["details"]["is_trivial"] is False


# ---------------------------------------------------------------------------
# Tests — rejections
# ---------------------------------------------------------------------------

def test_invalid_lean_rejected(all_results):
    """Malformed Lean code should fail compilation with score 0."""
    r = all_results["v3"]
    assert r["score"] == 0
    assert r["details"]["user_ok"] is False
    assert r["error"] is not None
    assert "compilation_error" in r["error"]


def test_sorry_proof_rejected(all_results):
    """`sorry` must not slip through — either the sorry-axiom audit
    catches it (bad_axioms: sorryAx) or the final verdict reports
    "proof uses sorry". Either way the error string contains "sorry"
    and has_sorry is set."""
    r = all_results["wrong"]
    assert r["score"] == 0
    assert r["details"]["has_sorry"] is True
    assert r["error"] is not None
    assert "sorry" in r["error"].lower()


def test_forbidden_answer_ref_rejected(all_results):
    """Self-referential answer that transitively uses `Finset.sum`
    must be rejected by the forbidden-answer-refs audit."""
    r = all_results["forbidden"]
    assert r["score"] == 0
    assert r["details"]["answer_ok"] is False
    assert r["error"] is not None
    assert "forbidden_answer_refs" in r["error"]
    # Either Finset.sum or sum_formula (both in forbiddenAnswerConsts) may
    # surface depending on how Lean elaborates the answer expression.
    assert "Finset.sum" in r["error"] or "sum_formula" in r["error"]
