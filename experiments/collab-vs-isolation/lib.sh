# Sourced by the run scripts. Loads the secrets, the shared config and one task's config.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$(cd "$ROOT/../../web" && pwd)"
PYTHON="$WEB/.venv/bin/python"
ARMS=(isolated collaborative)
RUN_ID_PATTERN='^[a-z][a-z0-9_]{0,18}[0-9]$'

load_task() {
  local task="$1"
  if [[ ! -f "$ROOT/tasks/$task/task.env" ]]; then
    echo "Unknown task '$task'. Tasks: $(ls "$ROOT/tasks" | tr '\n' ' ')" >&2
    exit 1
  fi
  if [[ ! -f "$ROOT/.env" ]]; then
    echo "Missing $ROOT/.env (see .env.example)" >&2
    exit 1
  fi
  set -a
  source "$ROOT/.env"
  source "$ROOT/config.env"
  source "$ROOT/tasks/$task/task.env"
  set +a
  export EXPERIMENT_TASK="$task"
  export EXPERIMENT_TASK_DIR="$ROOT/tasks/$task"
  EXPERIMENT_PROBLEM_SLUG="$(jq -r .slug "$EXPERIMENT_TASK_DIR/problem.json")"
  EXPERIMENT_SCORING="$(jq -r .scoring "$EXPERIMENT_TASK_DIR/problem.json")"
  export EXPERIMENT_PROBLEM_SLUG EXPERIMENT_SCORING
}

# Every run records its task in runs/<run-id>/task.
load_run() {
  local run_id="$1"
  if [[ ! "$run_id" =~ $RUN_ID_PATTERN ]]; then
    echo "Run ID must be 1-20 lowercase letters, digits or underscores, starting with a letter and ending with a digit" >&2
    exit 1
  fi
  if [[ ! -f "$ROOT/runs/$run_id/task" ]]; then
    echo "runs/$run_id/task is missing; start runs with run.sh" >&2
    exit 1
  fi
  load_task "$(cat "$ROOT/runs/$run_id/task")"
}
