"""
Creates a warm Lean sandbox from the template.

The cold start loads Mathlib — takes ~5 min. Run this once.
The resulting sandbox ID is saved to sandbox_id.txt and printed
for use as LEAN_WARM_SANDBOX_ID.
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _repl import LeanRepl, LEAN_TEMPLATE

from e2b import Sandbox

SANDBOX_ID_FILE = Path(__file__).parent / "sandbox_id.txt"


def main():
    api_key = os.environ["E2B_API_KEY"]

    print("Creating sandbox from template (cold start)...")
    t0 = time.time()
    sandbox = Sandbox.create(LEAN_TEMPLATE, timeout=3600, api_key=api_key)
    print(f"Sandbox created: {sandbox.sandbox_id} ({time.time()-t0:.1f}s)")

    repl = LeanRepl(sandbox)
    repl.start_fresh(stream_timeout=600)
    repl.warm(timeout=600)

    print("Pausing sandbox...")
    sandbox_id = sandbox.sandbox_id
    sandbox.pause()

    SANDBOX_ID_FILE.write_text(sandbox_id)
    print(f"\n✓ Done in {time.time()-t0:.0f}s total")
    print(f"  Sandbox ID: {sandbox_id}")
    print(f"  Saved to:   {SANDBOX_ID_FILE}")
    print(f"\n  Add to your .env.local:")
    print(f"  LEAN_WARM_SANDBOX_ID={sandbox_id}")


if __name__ == "__main__":
    main()
