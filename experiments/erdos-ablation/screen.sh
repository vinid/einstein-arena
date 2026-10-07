#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$ROOT/../../web/.venv/bin/python"
SESSION_SECONDS="${SESSION_SECONDS:-900}"
FRESH=4
CONTINUATIONS=2

run_id="${1:-}"
phase="${2:-all}"
if [[ ! "$run_id" =~ ^[a-z0-9][a-z0-9_]{0,19}$ || ! "$phase" =~ ^(all|continue)$ ]]; then
  echo "Usage: $0 <run-id> [all|continue]" >&2
  exit 1
fi

set -a
source "$ROOT/.env"
set +a

if [[ "$phase" == "all" && -e "$ROOT/runs/$run_id/isolated" ]]; then
  echo "runs/$run_id/isolated already exists; pick a new run ID" >&2
  exit 1
fi
if [[ -n "$(docker ps --quiet --filter "label=einsteinarena.experiment=erdos-ablation" --filter "label=einsteinarena.run")" ]]; then
  echo "Agents from another run are still running" >&2
  exit 1
fi

wait_for_agents() {
  local deadline=$(( $(date +%s) + SESSION_SECONDS + 60 ))
  while [[ -n "$(docker ps --quiet --filter "label=einsteinarena.run=$run_id" --filter "label=einsteinarena.arm=isolated")" ]]; do
    if (( $(date +%s) > deadline )); then
      echo "[screen] agents still up after the deadline; stopping them"
      break
    fi
    sleep 15
  done
  ./agents.sh stop isolated "$run_id"
  ./agents.sh harvest isolated "$run_id"
}

cd "$ROOT"
export MAX_RUNTIME_SECONDS_OVERRIDE="$SESSION_SECONDS"
# "continue" resumes a run whose fresh sessions are already harvested, on its still-running platform.
if [[ "$phase" == "all" ]]; then
  ./platform.sh stop isolated
  ./platform.sh start isolated "$run_id"
  export AGENT_COUNT_OVERRIDE="$FRESH"
  export AGENT_FIRST_NUMBER=1
  echo "[screen] $run_id $EXPERIMENT_PROBLEM_SLUG: $FRESH fresh sessions at $(date -u +%H:%M:%S) UTC"
  ./agents.sh start isolated "$run_id"
  wait_for_agents
fi

# The continuation start is the best scored solution of the fresh sessions, harvested or submitted.
start_file="$ROOT/runs/$run_id/start.json"
start_score="$("$PYTHON" - "$run_id" "$start_file" <<'PY'
import json
import os
import sys
from urllib.parse import urlparse

import psycopg2

run_id, out = sys.argv[1:]
dsn = urlparse(os.environ["DATABASE_URL"])._replace(path=f"/experiment_{run_id}_isolated").geturl()
order = {"minimize": "asc", "maximize": "desc"}[os.environ["EXPERIMENT_SCORING"]]
with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
    cur.execute(f"select agent_name, score, data from solutions where score is not null order by score {order} limit 1")
    agent, score, data = cur.fetchone()
with open(out, "w") as f:
    json.dump(data, f)
print(f"{score!r}")
print(f"[screen] start is {agent} at {score!r}", file=sys.stderr)
PY
)"

export AGENT_COUNT_OVERRIDE="$CONTINUATIONS"
export AGENT_FIRST_NUMBER=$((FRESH + 1))
export START_FILE="$start_file"
export START_SCORE="$start_score"
echo "[screen] $run_id: $CONTINUATIONS continuation sessions from $START_SCORE at $(date -u +%H:%M:%S) UTC"
./agents.sh start isolated "$run_id"
wait_for_agents

./platform.sh stop isolated
echo "[screen] $run_id finished at $(date -u +%H:%M:%S) UTC"
