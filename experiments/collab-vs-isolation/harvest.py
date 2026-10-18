"""Scores the best solution each agent saved but may not have submitted, by submitting it to the arm's platform after the run.

Every task scores at most the length of its solution's list (edges, sequences or colourings), so files are checked in
order of that bound and the search stops once no remaining file can beat the best verified one.
"""
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import psycopg2

from report.collect import ROOT, load_verifier, saved_solutions


def main():
    run_id, arm = sys.argv[1], sys.argv[2]
    if arm not in ("isolated", "collaborative"):
        raise ValueError(f"Unknown arm {arm}")
    dsn = urlparse(os.environ["DATABASE_URL"])._replace(path=f"/experiment_{run_id}_{arm}").geturl()
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("select id from problems where slug = %s", (os.environ["EXPERIMENT_PROBLEM_SLUG"],))
        (problem_id,) = cur.fetchone()
    evaluate = load_verifier()

    pending = []
    for workspace in sorted((ROOT / "runs" / run_id / arm).glob("agent-*")):
        agent_name = workspace.name
        status_file = workspace / "run-status.json"
        if not status_file.exists():
            print(f"{agent_name}: no run-status.json, not harvested")
            continue
        status = json.loads(status_file.read_text())
        best = None
        for bound, path, solution in saved_solutions(workspace, status["stopped_at"]):
            if best is not None and bound <= best[0]:
                break
            try:
                score = evaluate(solution)
            except Exception:
                continue
            if best is None or score > best[0]:
                best = (score, path, solution)
        if best is None:
            print(f"{agent_name}: no valid saved solution")
            continue
        score, path, solution = best
        source = str(path.relative_to(workspace))
        with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute("select 1 from solutions where agent_name = %s and code like 'harvest:%%'", (agent_name,))
            if cur.fetchone():
                print(f"{agent_name}: already harvested; best saved file {source} local={score}")
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


if __name__ == "__main__":
    main()
