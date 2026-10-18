"""Runs inside a probe container started by check.sh, with the same image, network, proxy, limits and environment names
as an agent of that arm. Prints one line per check and exits non-zero if any check fails."""
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import requests

ARM = os.environ["CHECK_ARM"]
BASE = os.environ["PLATFORM_BASE_URL"]
OTHER = os.environ["CHECK_OTHER_URL"]
failures = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'ok  ' if ok else 'FAIL'} {ARM:13} {name}{f' ({detail})' if detail else ''}", flush=True)
    if not ok:
        failures.append(name)


def status(method: str, url: str, **kwargs) -> int:
    try:
        return requests.request(method, url, timeout=20, **kwargs).status_code
    except requests.RequestException as error:
        return -1 if "ProxyError" in type(error).__name__ or "403" in str(error) else -2


# Resources: one pinned core, 1 GB, no compilers or Numba.
check("one CPU visible", os.cpu_count() == 1 or len(os.sched_getaffinity(0)) == 1, f"affinity {sorted(os.sched_getaffinity(0))}")
memory_max = Path("/sys/fs/cgroup/memory.max").read_text().strip()
check("memory limit 1 GB", memory_max == str(1024 ** 3), memory_max)
check("no C compiler", not any(shutil.which(c) for c in ("gcc", "cc", "clang", "g++")))
check("no Numba", subprocess.run(["python", "-c", "import numba"], capture_output=True).returncode != 0)

# Network: own platform and the model API only.
check("own platform reachable", status("GET", f"{BASE}/api/problems") == 401)
check("other arm's platform blocked", status("GET", f"{OTHER}/api/problems") not in (200, 401, 404))
check("internet blocked", status("GET", "https://example.com") not in range(200, 400))
check("model API reachable", status("GET", "https://api.openai.com/v1/models") in (200, 401))

# Platform: one problem, own submissions scored by the server verifier, shared state only in the collaborative arm.
token = requests.post(f"{BASE}/api/agents/register", json={"name": os.environ["AGENT_NAME"]}, timeout=20).json()["agent"]["api_key"]
headers = {"Authorization": f"Bearer {token}"}
problems = requests.get(f"{BASE}/api/problems", headers=headers, timeout=20).json()
check("exactly one problem", len(problems) == 1 and problems[0]["slug"] == os.environ["CHECK_SLUG"], str([p["slug"] for p in problems]))
problem = requests.get(f"{BASE}/api/problems/{problems[0]['slug']}", headers=headers, timeout=20).json()
seed = json.loads(Path("/check/seed.json").read_text())
submission = requests.post(f"{BASE}/api/solutions", headers=headers, json={"problem_id": problem["id"], "solution": seed}, timeout=60).json()
deadline = time.time() + 180
while True:
    state = requests.get(f"{BASE}/api/solutions/{submission['id']}", headers=headers, timeout=20).json()
    if state["status"] not in ("pending", "evaluating") or time.time() > deadline:
        break
    time.sleep(2)
check("seed scored by server verifier", state["status"] == "evaluated" and state["score"] == float(os.environ["CHECK_SEED_SCORE"]),
      f"{state['status']} {state.get('score')}")
check("second submission within a minute is rate limited",
      status("POST", f"{BASE}/api/solutions", headers=headers, json={"problem_id": problem["id"], "solution": seed}) == 429)
check("other agents' solutions not readable by id", status("GET", f"{BASE}/api/solutions/{int(os.environ['CHECK_OTHER_SOLUTION_ID'])}", headers=headers) == 404)
shared = {
    "leaderboard": f"{BASE}/api/leaderboard?problem_id={problem['id']}",
    "shared solutions": f"{BASE}/api/solutions/best?problem_id={problem['id']}",
    "threads": f"{BASE}/api/problems/{problems[0]['slug']}/threads",
}
for name, url in shared.items():
    code = status("GET", url, headers=headers)
    check(f"{name} {'open' if ARM == 'collaborative' else 'closed'}", code == (200 if ARM == "collaborative" else 404), str(code))
post = status("POST", f"{BASE}/api/problems/{problems[0]['slug']}/threads", headers=headers, json={"title": "probe", "body": "probe"})
check(f"posting {'open' if ARM == 'collaborative' else 'closed'}", post == (201 if ARM == "collaborative" else 404) or (ARM == "collaborative" and post == 200), str(post))
check("web pages closed", status("GET", f"{BASE}/") == 404)

raise SystemExit(1 if failures else 0)
