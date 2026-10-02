#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$ROOT/../../web/.venv/bin/python"
DASHBOARD_PORT=8765
ARMS=(isolated collaborative)

run_id="${1:-}"
if [[ ! "$run_id" =~ ^[a-z0-9][a-z0-9_]{0,19}$ ]]; then
  echo "Usage: $0 <run-id>  (1-20 lowercase letters, digits, or underscores)" >&2
  exit 1
fi

set -a
source "$ROOT/.env"
set +a
: "${MAX_RUNTIME_SECONDS:?MAX_RUNTIME_SECONDS is required}"

for arm in "${ARMS[@]}"; do
  if [[ -e "$ROOT/runs/$run_id/$arm" ]]; then
    echo "runs/$run_id/$arm already exists; pick a new run ID" >&2
    exit 1
  fi
done
if [[ -n "$(docker ps --quiet --filter "label=einsteinarena.experiment=erdos-ablation" --filter "label=einsteinarena.run")" ]]; then
  echo "Agents from another run are still running:" >&2
  docker ps --filter "label=einsteinarena.run" --format '  {{.Names}}' >&2
  exit 1
fi

cd "$ROOT"
for arm in "${ARMS[@]}"; do
  ./platform.sh stop "$arm"
  ./platform.sh start "$arm" "$run_id"
done
for arm in "${ARMS[@]}"; do
  ./agents.sh start "$arm" "$run_id"
done
started="$(date +%s)"
echo "[run] $run_id started at $(date -u +%H:%M:%S) UTC"

dashboard_pid_file="$ROOT/runs/dashboard.pid"
if [[ -f "$dashboard_pid_file" ]] && [[ -n "$(ps -p "$(cat "$dashboard_pid_file")" -o pid=)" ]]; then
  kill "$(cat "$dashboard_pid_file")"
fi
nohup "$PYTHON" "$ROOT/report/serve.py" "$run_id" "$DASHBOARD_PORT" >"$ROOT/runs/$run_id/dashboard.log" 2>&1 &
echo $! >"$dashboard_pid_file"
echo "[run] dashboard at http://localhost:$DASHBOARD_PORT"

# Supervisors stop themselves at MAX_RUNTIME_SECONDS; the extra 30 seconds cover Codex shutdown and the status write.
deadline=$((started + MAX_RUNTIME_SECONDS + 30))
while [[ -n "$(docker ps --quiet --filter "label=einsteinarena.run=$run_id")" ]]; do
  if (( $(date +%s) > deadline )); then
    echo "[run] containers still up after the deadline; stopping them"
    break
  fi
  sleep 15
done

for arm in "${ARMS[@]}"; do
  ./agents.sh stop "$arm" "$run_id"
done
for arm in "${ARMS[@]}"; do
  ./agents.sh harvest "$arm" "$run_id"
done
"$PYTHON" "$ROOT/report/build.py" "$run_id"
for arm in "${ARMS[@]}"; do
  ./platform.sh stop "$arm"
done
echo "[run] $run_id finished at $(date -u +%H:%M:%S) UTC"
