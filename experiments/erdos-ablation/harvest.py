import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from collect import FAST_SCORE, load_candidate

ROOT = Path(__file__).resolve().parent
run_id, arm = sys.argv[1], sys.argv[2]
if arm not in ("single", "isolated", "collaborative"):
    raise ValueError(f"Unknown arm {arm}")
dsn = urlparse(os.environ["DATABASE_URL"])._replace(path=f"/experiment_{run_id}_{arm}").geturl()
slug = os.environ["EXPERIMENT_PROBLEM_SLUG"]
arm_code = arm[0]


def candidates(workspace: Path, cutoff: float) -> list[Path]:
    preferred = [workspace / "best.json", *sorted((workspace / "history").glob("*.json"))]
    # Fallback for agents that ignored the save instruction; every JSON file is tried.
    others = sorted(
        p for p in workspace.rglob("*.json")
        if "codex-state" not in p.parts and "seeds" not in p.parts and p not in preferred
    )
    return [p for p in preferred + others if p.is_file() and p.stat().st_mtime <= cutoff]


def load_solution(path: Path):
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
    cur.execute("select id, verifier, scoring from problems where slug = %s", (slug,))
    problem_id, verifier, scoring = cur.fetchone()
namespace: dict = {}
exec(verifier, namespace)
evaluate = namespace["evaluate"]
better = (lambda a, b: a < b) if scoring == "minimize" else (lambda a, b: a > b)

pending = []
for workspace in sorted((ROOT / "runs" / run_id / arm).glob("agent-*")):
    agent_name = f"ea-{arm_code}-{run_id}-{workspace.name.split('-')[1]}"
    status = json.loads((workspace / "run-status.json").read_text())
    # Agents can save tens of thousands of files, so the fast scorer ranks them and the verifier runs on the leaders only.
    ranked = []
    for path in candidates(workspace, status["stopped_at"]):
        if load_solution(path) is None:
            continue
        arr = load_candidate(path)
        if arr is not None:
            ranked.append((FAST_SCORE(arr), path))
    ranked.sort(key=lambda item: item[0], reverse=scoring == "maximize")
    best = None
    for _, path in ranked:
        solution = load_solution(path)
        try:
            best = (evaluate(solution), path, solution)
        except Exception:
            continue
        break
    if best is None:
        print(f"{agent_name}: no valid saved solution")
        continue
    score, path, solution = best
    source = str(path.relative_to(workspace))
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("select 1 from solutions where agent_name = %s and code like 'harvest:%%'", (agent_name,))
        if cur.fetchone():
            continue
        cur.execute(
            "insert into solutions (problem_id, agent_name, status, data, code) values (%s, %s, 'pending', %s, %s) returning id",
            (problem_id, agent_name, json.dumps(solution), f"harvest:{source}"),
        )
        (solution_id,) = cur.fetchone()
        cur.execute(
            "insert into agent_events (agent_name, event_type, endpoint, metadata) values (%s, 'harvest_submission', 'harvest.py', %s)",
            (agent_name, json.dumps({
                "problem_id": problem_id, "solution_id": solution_id, "source": source,
                "local_score": score, "file_mtime": path.stat().st_mtime, "stopped_at": status["stopped_at"],
            })),
        )
    pending.append((agent_name, solution_id, source, score))

deadline = time.time() + 600
for agent_name, solution_id, source, local_score in pending:
    while True:
        with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute("select status, score, error from solutions where id = %s", (solution_id,))
            state, server_score, error = cur.fetchone()
        if state in ("evaluated", "rejected", "error"):
            break
        if time.time() > deadline:
            raise TimeoutError(f"solution {solution_id} still {state}; is the experiment worker running?")
        time.sleep(2)
    print(f"{agent_name}: {source} local={local_score} server={server_score} status={state} {error or ''}")
