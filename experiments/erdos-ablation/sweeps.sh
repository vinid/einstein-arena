#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$ROOT/../../web/.venv/bin/python"
DASHBOARD_PORT=8765
ARMS=(isolated collaborative single)
SWEEP_SECONDS=900

run_id="${1:-}"
if [[ ! "$run_id" =~ ^[a-z0-9][a-z0-9_]{0,19}$ ]]; then
  echo "Usage: $0 <run-id>" >&2
  exit 1
fi

set -a
source "$ROOT/.env"
set +a
# One collaborative agent per sweep, so the relay spends the same agent-minutes as the isolated arm.
SWEEPS="$AGENT_COUNT"

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

dashboard_pid_file="$ROOT/runs/dashboard.pid"
if [[ -f "$dashboard_pid_file" ]] && [[ -n "$(ps -p "$(cat "$dashboard_pid_file")" -o pid=)" ]]; then
  kill "$(cat "$dashboard_pid_file")"
fi
nohup "$PYTHON" "$ROOT/report/serve.py" "$run_id" "$DASHBOARD_PORT" >"$ROOT/runs/$run_id/dashboard.log" 2>&1 &
echo $! >"$dashboard_pid_file"
echo "[sweeps] dashboard at http://localhost:$DASHBOARD_PORT"

export AGENT_FIRST_NUMBER=1
export MAX_RUNTIME_SECONDS_OVERRIDE="$SWEEP_SECONDS"
echo "[sweeps] $run_id isolated agents start together for $MAX_RUNTIME_SECONDS_OVERRIDE seconds at $(date -u +%H:%M:%S) UTC"
./agents.sh start isolated "$run_id"

# One agent alone for the whole relay: same agent-minutes and continuity as the relay, but no board.
export MAX_RUNTIME_SECONDS_OVERRIDE=$((SWEEPS * SWEEP_SECONDS))
echo "[sweeps] $run_id single agent starts for $MAX_RUNTIME_SECONDS_OVERRIDE seconds at $(date -u +%H:%M:%S) UTC"
./agents.sh start single "$run_id"

export MAX_RUNTIME_SECONDS_OVERRIDE="$SWEEP_SECONDS"
export AGENT_COUNT_OVERRIDE=1
for sweep in $(seq 1 "$SWEEPS"); do
  export AGENT_FIRST_NUMBER="$sweep"
  echo "[sweeps] $run_id collaborative sweep $sweep of $SWEEPS, agent $(printf '%02d' "$AGENT_FIRST_NUMBER"), at $(date -u +%H:%M:%S) UTC"
  ./agents.sh start collaborative "$run_id"
  started="$(date +%s)"
  deadline=$((started + SWEEP_SECONDS + 30))
  while [[ -n "$(docker ps --quiet --filter "label=einsteinarena.run=$run_id" --filter "label=einsteinarena.arm=collaborative")" ]]; do
    if (( $(date +%s) > deadline )); then
      echo "[sweeps] sweep $sweep still up after the deadline; stopping it"
      break
    fi
    sleep 15
  done
  ./agents.sh stop collaborative "$run_id"
  ./agents.sh harvest collaborative "$run_id"
  echo "[sweeps] $run_id sweep $sweep harvested at $(date -u +%H:%M:%S) UTC"
done

for arm in isolated single; do
  ./agents.sh stop "$arm" "$run_id"
  ./agents.sh harvest "$arm" "$run_id"
done

"$PYTHON" "$ROOT/report/build.py" "$run_id"
for arm in "${ARMS[@]}"; do
  ./platform.sh stop "$arm"
done
echo "[sweeps] $run_id finished at $(date -u +%H:%M:%S) UTC"
