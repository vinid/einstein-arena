"""
Integration tests for the Lean proof verification pipeline.

Uses the "sum_open" problem — a toy version of the open-problem verification
flow where the answer is unknown to the verifier:

    "For all n, there exists k such that 2 * ∑_{i=0}^{n} i = k"

Five test cases exercise every verification outcome:
  - correct proof (two equivalent expressions)
  - invalid Lean code
  - wrong answer using sorry
  - self-referential trivial answer

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

EXAMPLES_DIR = Path(__file__).resolve().parent / "lean_examples"

VERIFIER_CONFIG = json.dumps({
    "statement": (
        "import FormalConjectures.Util.ProblemImports\n\n"
        "theorem sum_formula (n : ℕ) :\n"
        "    2 * ∑ i ∈ Finset.range (n + 1), i = answer(sorry) := by\n"
        "  sorry"
    ),
    "verifier": (
        "example (n : ℕ) : "
        "∃ k : ℕ, 2 * ∑ i ∈ Finset.range (n + 1), i = k := ⟨_, sum_formula n⟩"
    ),
    "antitrivial": (
        "example (n : ℕ) : "
        "2 * ∑ i ∈ Finset.range (n + 1), i = "
        "2 * ∑ i ∈ Finset.range (n + 1), i := sum_formula n"
    ),
})


def _skip_if_no_e2b():
    if not os.environ.get("E2B_API_KEY"):
        pytest.skip("E2B_API_KEY not set — skipping Lean verification tests")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def _require_e2b():
    _skip_if_no_e2b()


# We run all 5 cases in one verifier session to avoid re-creating the
# sandbox for each test.  Results are cached in a module-scoped fixture.

@pytest.fixture(scope="module")
def all_results() -> dict[str, dict]:
    """Run all 5 test Lean files through the verifier in a single session."""
    lean_files = {
        "v1": "verify_sum_open_v1.lean",
        "v2": "verify_sum_open_v2.lean",
        "v3": "verify_sum_open_v3.lean",
        "wrong": "verify_sum_open_wrong.lean",
        "trivial": "verify_sum_open_trivial.lean",
    }

    web_dir = Path(__file__).resolve().parent.parent

    # Build one tsx script that verifies all files in a single session
    file_map = json.dumps({k: (EXAMPLES_DIR / v).read_text() for k, v in lean_files.items()})
    verifier_config = json.dumps(VERIFIER_CONFIG)

    script = f"""\
import {{ LeanVerifier }} from "./src/lib/lean-verify";
const files: Record<string, string> = {file_map};
const config = {verifier_config};
(async () => {{
  const v = new LeanVerifier();
  await v.init();
  const results: Record<string, any> = {{}};
  try {{
    for (const [key, code] of Object.entries(files)) {{
      results[key] = await v.verifyProof(code, config);
    }}
    process.stdout.write("RESULT:" + JSON.stringify(results));
  }} finally {{
    await v.close();
  }}
}})();
"""
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
    assert r["score"] == 1
    assert r["details"]["user_ok"] is True
    assert r["details"]["verify_ok"] is True
    assert r["details"]["has_sorry"] is False
    assert r["details"]["is_trivial"] is False


def test_correct_proof_v2_accepted(all_results):
    """Equivalent expression n^2+n should also score 1."""
    r = all_results["v2"]
    assert r["score"] == 1
    assert r["details"]["user_ok"] is True
    assert r["details"]["verify_ok"] is True
    assert r["details"]["has_sorry"] is False
    assert r["details"]["is_trivial"] is False


# ---------------------------------------------------------------------------
# Tests — rejections
# ---------------------------------------------------------------------------

def test_invalid_lean_code_rejected(all_results):
    """Malformed Lean code should fail compilation with score 0."""
    r = all_results["v3"]
    assert r["score"] == 0
    assert r["details"]["user_ok"] is False
    assert r["error"] is not None
    assert "compilation_error" in r["error"]


def test_sorry_proof_rejected(all_results):
    """Wrong answer proved with sorry should be detected and rejected."""
    r = all_results["wrong"]
    assert r["score"] == 0
    assert r["details"]["has_sorry"] is True
    assert r["error"] == "proof uses sorry"


def test_trivial_self_referential_rejected(all_results):
    """answer(LHS) proved by rfl — anti-triviality check must catch this."""
    r = all_results["trivial"]
    assert r["score"] == 0
    assert r["details"]["is_trivial"] is True
    assert r["error"] == "trivial self-referential answer"
