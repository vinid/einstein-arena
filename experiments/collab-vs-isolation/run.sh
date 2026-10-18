#!/usr/bin/env bash
# One run: both arms of one task at the same time, on fresh platforms, then harvest and report.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
DASHBOARD_PORT=8765

task="${1:-}"
run_id="${2:-}"
if [[ -z "$task" || ! "$run_id" =~ $RUN_ID_PATTERN ]]; then
  echo "Usage: $0 <$(ls "$ROOT/tasks" | paste -sd '|' -)> <run-id>  (run-id: 1-20 lowercase letters, digits or underscores, starting with a letter and ending with a digit)" >&2
  exit 1
fi
load_task "$task"
run_dir="$ROOT/runs/$run_id"
if [[ -e "$run_dir" ]]; then
  echo "runs/$run_id already exists; pick a new run ID" >&2
  exit 1
fi
if [[ -n "$(docker ps --quiet --filter "label=einsteinarena.experiment=collab-vs-isolation" --filter "label=einsteinarena.run")" ]]; then
  echo "Agents from another run are still running:" >&2
  docker ps --filter "label=einsteinarena.run" --format '  {{.Names}}' >&2
  exit 1
fi

# Everything the agents get is fixed before they start and kept with the run.
mkdir -p "$run_dir"
echo "$task" >"$run_dir/task"
"$PYTHON" "$ROOT/prompts/render.py" "$task" "$run_dir/prompts"
{
  echo "git $(git -C "$ROOT" rev-parse HEAD)$(git -C "$ROOT" diff --quiet HEAD -- "$ROOT" "$WEB" || echo ' (uncommitted changes)')"
  (cd "$ROOT" && find config.env tasks/"$task" prompts docker -type f -not -path '*/__pycache__/*' | sort | xargs shasum -a 256)
} >"$run_dir/manifest.txt"

cd "$ROOT"
for arm in "${ARMS[@]}"; do
  ./platform.sh stop "$arm"
  ./platform.sh start "$arm" "$run_id"
done
./agents.sh start "$run_id"
started="$(date +%s)"
echo "[run] $task $run_id started at $(date -u +%H:%M:%S) UTC"

dashboard_pid_file="$ROOT/runs/dashboard.pid"
if [[ -f "$dashboard_pid_file" ]] && [[ -n "$(ps -p "$(cat "$dashboard_pid_file")" -o pid=)" ]]; then
  kill "$(cat "$dashboard_pid_file")"
fi
nohup "$PYTHON" "$ROOT/report/serve.py" "$run_id" "$DASHBOARD_PORT" >"$run_dir/dashboard.log" 2>&1 &
echo $! >"$dashboard_pid_file"
echo "[run] dashboard at http://localhost:$DASHBOARD_PORT"

# Supervisors stop themselves at MAX_RUNTIME_SECONDS; the extra 30 seconds cover Codex shutdown and the status write.
deadline=$((started + MAX_RUNTIME_SECONDS + 30))
while [[ -n "$(docker ps --quiet --filter "label=einsteinarena.run=$run_id")" ]]; do
  if (( $(date +%s) > deadline )); then
    echo "[run] containers still up after the deadline; stopping them"
    break
  fi
  sleep 5
done

./agents.sh stop "$run_id"
# A failed harvest still cleans up and builds the report, then fails the run so a batch stops.
harvest_failed=0
./agents.sh harvest "$run_id" || harvest_failed=1
./agents.sh clean "$run_id"
"$PYTHON" "$ROOT/report/build.py" "$run_id"
for arm in "${ARMS[@]}"; do
  ./platform.sh stop "$arm"
done
echo "[run] $task $run_id finished at $(date -u +%H:%M:%S) UTC"
if (( harvest_failed )); then
  echo "[run] harvest failed; see the output above" >&2
  exit 1
fi
