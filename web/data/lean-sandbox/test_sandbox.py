"""
Tests a warm Lean sandbox.

Reads the sandbox ID from sandbox_id.txt (or LEAN_WARM_SANDBOX_ID env var),
resumes it, connects to the already-running REPL, runs a simple verification,
asserts the total time is <20s, then pauses again.

If the REPL isn't running (unexpected), falls back to starting fresh — but this
will be slow and the 20s assertion will fail, indicating the sandbox needs rebuilding.
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _repl import LeanRepl

from e2b import Sandbox

SANDBOX_ID_FILE = Path(__file__).parent / "sandbox_id.txt"
MAX_TOTAL_SECONDS = 20

SIMPLE_THEOREM = "theorem add_comm_test (a b : Nat) : a + b = b + a := Nat.add_comm a b"


def main():
    sandbox_id = SANDBOX_ID_FILE.read_text().strip()
    print(f"Connecting to sandbox: {sandbox_id}")

    t0 = time.time()

    sandbox = Sandbox._cls_connect_sandbox(sandbox_id, timeout=300)
    print(f"  Connected ({time.time()-t0:.1f}s)")

    repl = LeanRepl(sandbox)
    repl.start(stream_timeout=600)

    warm_env = repl.warm(timeout=300)

    print("Running simple theorem...")
    resp = repl.send(SIMPLE_THEOREM, env=warm_env, timeout=30)
    errors = [m for m in resp.get("messages", []) if m.get("severity") == "error"]

    elapsed = time.time() - t0
    print(f"Errors: {errors}")
    print(f"Total time: {elapsed:.1f}s")

    sandbox.pause()
    print("Sandbox paused.")

    assert not errors, f"Lean errors: {errors}"
    assert elapsed < MAX_TOTAL_SECONDS, (
        f"FAIL: took {elapsed:.1f}s (limit {MAX_TOTAL_SECONDS}s). "
        f"Sandbox needs to be recreated with create_sandbox.py."
    )

    print(f"\n✓ PASS — {elapsed:.1f}s (limit {MAX_TOTAL_SECONDS}s)")


if __name__ == "__main__":
    main()
