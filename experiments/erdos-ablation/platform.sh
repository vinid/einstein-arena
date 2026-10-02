#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$(cd "$ROOT/../../web" && pwd)"
action="${1:-}"
arm="${2:-}"
run_id="${3:-}"
usage="Usage: $0 start <single|isolated|collaborative> <run-id> | $0 stop|status <single|isolated|collaborative>"

if [[ ! "$arm" =~ ^(single|isolated|collaborative)$ ]]; then
  echo "$usage" >&2
  exit 1
fi

runtime="$ROOT/runs/platforms"
pid_file="$runtime/$arm.pid"
run_file="$runtime/$arm.run"
mkdir -p "$runtime"

case "$arm" in
  single) port=3001; skill=skill-single.md ;;
  isolated) port=3002; skill=skill-single.md ;;
  collaborative) port=3003; skill=skill-collaborative.md ;;
esac

is_running() {
  [[ -f "$pid_file" ]] && [[ -n "$(ps -p "$(cat "$pid_file")" -o pid=)" ]]
}

case "$action" in
  start)
    if [[ ! "$run_id" =~ ^[a-z0-9][a-z0-9_]{0,19}$ ]]; then
      echo "run-id must be 1-20 lowercase letters, digits, or underscores" >&2
      exit 1
    fi
    if is_running; then
      echo "$arm platform is already running for run $(cat "$run_file"); stop it first" >&2
      exit 1
    fi
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN; then
      echo "Port $port is already in use" >&2
      exit 1
    fi
    (
      cd "$WEB"
      env -u DATABASE_URL -u EXPERIMENT_PROBLEM_SLUG node \
        --env-file=".env.local" \
        --env-file="$ROOT/.env" \
        --import tsx scripts/experiment-db.ts "$run_id" "$arm"
    )
    stdout_file="$ROOT/runs/$run_id/platform-$arm.stdout.log"
    stderr_file="$ROOT/runs/$run_id/platform-$arm.stderr.log"
    mkdir -p "$ROOT/runs/$run_id"
    pid="$(
      python3 - "$WEB" "$ROOT/.env" "$arm" "$run_id" "$stdout_file" "$stderr_file" <<'PY'
import os
import sys

web, experiment_env, arm, run_id, stdout, stderr = sys.argv[1:]
pid = os.fork()
if pid:
    print(pid)
    raise SystemExit(0)
os.setsid()
os.chdir(web)
for name in ("DATABASE_URL", "REDIS_URL", "BASE_URL", "EXPERIMENT_ARM", "EXPERIMENT_INSTANCE", "EXPERIMENT_PROBLEM_SLUG"):
    os.environ.pop(name, None)
out = os.open(stdout, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
err = os.open(stderr, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(out, 1)
os.dup2(err, 2)
os.execvp(
    "node",
    [
        "node",
        "--env-file",
        ".env.local",
        "--env-file",
        experiment_env,
        "--import",
        "tsx",
        "scripts/experiment-run.ts",
        arm,
        run_id,
    ],
)
PY
    )"
    echo "$pid" >"$pid_file"
    echo "$run_id" >"$run_file"
    for _ in $(seq 1 60); do
      if body="$(curl --fail --silent "http://localhost:$port/$skill")"; then
        if [[ "$arm" == "collaborative" && "$body" == *"Collaborative Arm"* ]]; then
          echo "$arm platform is ready on http://localhost:$port"
          exit 0
        fi
        if [[ "$arm" != "collaborative" && "$body" == *"Independent Arm"* ]]; then
          echo "$arm platform is ready on http://localhost:$port"
          exit 0
        fi
      fi
      sleep 1
    done
    echo "$arm platform failed to become ready; inspect $stderr_file" >&2
    exit 1
    ;;
  stop)
    if [[ ! -f "$pid_file" ]]; then
      echo "$arm platform has no recorded process"
      exit 0
    fi
    pid="$(cat "$pid_file")"
    if [[ -n "$(ps -p "$pid" -o pid=)" ]]; then
      kill -TERM -- "-$pid"
      for _ in $(seq 1 10); do
        if [[ -z "$(ps -p "$pid" -o pid=)" ]]; then
          break
        fi
        sleep 1
      done
      if [[ -n "$(ps -p "$pid" -o pid=)" ]]; then
        kill -KILL -- "-$pid"
      fi
    fi
    rm -f "$pid_file" "$run_file"
    ;;
  status)
    if is_running; then
      echo "$arm platform is running on http://localhost:$port for run $(cat "$run_file")"
    else
      echo "$arm platform is stopped"
    fi
    ;;
  *)
    echo "$usage" >&2
    exit 1
    ;;
esac
