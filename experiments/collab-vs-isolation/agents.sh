#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

IMAGE="einsteinarena-collab-agent:0.2"
PROXY_IMAGE="einsteinarena-collab-proxy:0.2"
LABEL="einsteinarena.experiment=collab-vs-isolation"
usage="Usage: $0 build | $0 start|stop|harvest|clean|status|probe <run-id> | $0 logs <run-id> <isolated|collaborative> <agent-number>"

arm_network() { echo "einsteinarena-collab-agents-$1"; }
arm_proxy() { echo "einsteinarena-collab-proxy-$1"; }
arm_port() { if [[ "$1" == isolated ]]; then echo 3002; else echo 3003; fi; }

action="${1:-}"
if [[ "$action" == "build" ]]; then
  docker build --tag "$IMAGE" "$ROOT/docker"
  docker build --file "$ROOT/docker/Dockerfile.proxy" --tag "$PROXY_IMAGE" "$ROOT/docker"
  exit 0
fi

run_id="${2:-}"
if [[ -z "$run_id" ]]; then
  echo "$usage" >&2
  exit 1
fi
load_run "$run_id"
run_dir="$ROOT/runs/$run_id"

run_containers() {
  docker ps "$@" --quiet --filter "label=$LABEL" --filter "label=einsteinarena.run=$run_id"
}

# One internal network per arm. Its only way out is the arm's proxy, which allows the model API and that arm's platform.
ensure_proxy() {
  local arm="$1" network proxy vm_cpus
  network="$(arm_network "$arm")"
  proxy="$(arm_proxy "$arm")"
  if [[ -z "$(docker network ls --quiet --filter "name=^${network}$")" ]]; then
    docker network create --internal "$network" >/dev/null
  fi
  # A proxy left from an older image or config is replaced, so both arms always run the current one.
  if [[ -n "$(docker ps --all --quiet --filter "name=^/${proxy}$")" ]] \
    && [[ "$(docker inspect "$proxy" --format '{{.Config.Image}}')" != "$PROXY_IMAGE" ]]; then
    docker rm --force "$proxy" >/dev/null
  fi
  if [[ -z "$(docker ps --all --quiet --filter "name=^/${proxy}$")" ]]; then
    vm_cpus="$(docker info --format '{{.NCPU}}')"
    docker run --detach \
      --name "$proxy" \
      --cpuset-cpus "$(( vm_cpus - RESERVED_CPUS ))-$(( vm_cpus - 1 ))" \
      --network bridge \
      --add-host host.docker.internal:host-gateway \
      --label "$LABEL" \
      --label "einsteinarena.arm=$arm" \
      --mount "type=bind,source=$ROOT/docker/squid-$arm.conf,target=/etc/squid/squid.conf,readonly" \
      "$PROXY_IMAGE" >/dev/null
  elif [[ -z "$(docker ps --quiet --filter "name=^/${proxy}$")" ]]; then
    docker start "$proxy" >/dev/null
  fi
  if [[ "$(docker network inspect "$network" --format '{{range .Containers}}{{.Name}} {{end}}')" != *"$proxy"* ]]; then
    docker network connect --alias "$proxy" "$network" "$proxy"
  fi
}

# Each agent owns whole cores, so idle time in one arm cannot become compute for the other. Which arm gets the lower
# cores alternates with the run number, so any difference between cores is balanced across runs.
first_core() {
  local arm="$1" number="$2" digits block=0
  if [[ "$arm" == collaborative ]]; then block=1; fi
  digits="${run_id##*[!0-9]}"
  if [[ -n "$digits" ]] && (( 10#$digits % 2 )); then block=$(( 1 - block )); fi
  echo $(( (block * AGENT_COUNT + number - 1) * AGENT_CPUS ))
}

# Extra arguments replace the agent's command; check.sh uses them to run a probe with the agent's exact settings.
start_agent() {
  local arm="$1" number="$2" index core cpuset workspace prompt_dir proxy name
  shift 2
  printf -v index "%02d" "$number"
  core="$(first_core "$arm" "$number")"
  cpuset="$core-$(( core + AGENT_CPUS - 1 ))"
  workspace="$run_dir/$arm/agent-$index"
  prompt_dir="$run_dir/prompts/$arm-$index"
  proxy="$(arm_proxy "$arm")"
  mkdir -p "$workspace/codex-state" "$workspace/seeds"
  cp "$prompt_dir/AGENTS.md" "$workspace/codex-state/AGENTS.md"
  cp "$EXPERIMENT_TASK_DIR/seeds/seed-$number.json" "$workspace/seeds/"
  name="collab-$arm-$run_id-$index"
  if (( $# )); then
    name="$name-probe"
  else
    echo "$arm agent-$index cpus $cpuset" >>"$run_dir/cores.txt"
  fi

  docker run --detach --interactive --tty --init \
    --name "$name" \
    --hostname "agent-$index" \
    --label "$LABEL" \
    --label "einsteinarena.arm=$arm" \
    --label "einsteinarena.run=$run_id" \
    --cpuset-cpus "$cpuset" \
    --memory "$AGENT_MEMORY" \
    --network "$(arm_network "$arm")" \
    --mount "type=bind,source=$workspace,target=/workspace" \
    --mount "type=bind,source=$prompt_dir/goal.md,target=/opt/agent/goal.md,readonly" \
    --env "OPENAI_API_KEY=$OPENAI_API_KEY" \
    --env "HTTP_PROXY=http://$proxy:3128" \
    --env "HTTPS_PROXY=http://$proxy:3128" \
    --env "http_proxy=http://$proxy:3128" \
    --env "https_proxy=http://$proxy:3128" \
    --env "NO_PROXY=localhost,127.0.0.1,$proxy" \
    --env "no_proxy=localhost,127.0.0.1,$proxy" \
    --env "AGENT_NAME=agent-$index" \
    --env "PLATFORM_BASE_URL=http://host.docker.internal:$(arm_port "$arm")" \
    --env "BUDGET_USD=$AGENT_BUDGET_USD" \
    --env "INPUT_USD_PER_MILLION=$INPUT_USD_PER_MILLION" \
    --env "CACHED_INPUT_USD_PER_MILLION=$CACHED_INPUT_USD_PER_MILLION" \
    --env "OUTPUT_USD_PER_MILLION=$OUTPUT_USD_PER_MILLION" \
    --env "MAX_RUNTIME_SECONDS=$MAX_RUNTIME_SECONDS" \
    --env "CODEX_MODEL=$CODEX_MODEL" \
    --env "CODEX_REASONING_EFFORT=$CODEX_REASONING_EFFORT" \
    ${probe_args[@]+"${probe_args[@]}"} \
    "$IMAGE" "$@" >/dev/null
}

probe_args=()
case "$action" in
  start)
    docker image inspect "$IMAGE" "$PROXY_IMAGE" >/dev/null
    vm_cpus="$(docker info --format '{{.NCPU}}')"
    if (( 2 * AGENT_COUNT * AGENT_CPUS > vm_cpus - RESERVED_CPUS )); then
      echo "$((2 * AGENT_COUNT)) agents x $AGENT_CPUS cores do not fit in $vm_cpus VM cores minus $RESERVED_CPUS reserved" >&2
      exit 1
    fi
    for arm in "${ARMS[@]}"; do
      ensure_proxy "$arm"
    done
    # Agent N starts in both arms back to back, so the two arms start within seconds of each other.
    for number in $(seq 1 "$AGENT_COUNT"); do
      for arm in "${ARMS[@]}"; do
        start_agent "$arm" "$number"
      done
    done
    ;;
  probe)
    # One probe per arm in agent 1's place: same image, cores, memory, network, proxy and environment.
    docker image inspect "$IMAGE" "$PROXY_IMAGE" >/dev/null
    for arm in "${ARMS[@]}"; do
      ensure_proxy "$arm"
    done
    for arm in "${ARMS[@]}"; do
      probe_args=(
        --mount "type=bind,source=$ROOT/check_probe.py,target=/check/probe.py,readonly"
        --mount "type=bind,source=$EXPERIMENT_TASK_DIR/seeds/seed-1.json,target=/check/seed.json,readonly"
        --env "CHECK_ARM=$arm"
        --env "CHECK_SLUG=$EXPERIMENT_PROBLEM_SLUG"
        --env "CHECK_SEED_SCORE=$(jq '.["seed-1.json"]' "$EXPERIMENT_TASK_DIR/seeds/index.json")"
        --env "CHECK_OTHER_URL=http://host.docker.internal:$(arm_port "$( [[ $arm == isolated ]] && echo collaborative || echo isolated )")"
        --env "CHECK_OTHER_SOLUTION_ID=$(cat "$run_dir/other-solution-$arm")"
        --entrypoint python
      )
      start_agent "$arm" 1 /check/probe.py
    done
    ;;
  stop)
    # The supervisor needs up to ~15 s after SIGTERM to stop Codex and write run-status.json.
    run_containers | while read -r container; do
      docker stop --timeout 30 "$container" >/dev/null
    done
    ;;
  harvest)
    if [[ -n "$(run_containers)" ]]; then
      echo "Stop run $run_id before harvesting" >&2
      exit 1
    fi
    failed=0
    for arm in "${ARMS[@]}"; do
      "$PYTHON" "$ROOT/harvest.py" "$run_id" "$arm" || failed=1
    done
    exit "$failed"
    ;;
  clean)
    run_containers --all | while read -r container; do
      docker rm --force "$container" >/dev/null
    done
    ;;
  status)
    docker ps --all --filter "label=$LABEL" --filter "label=einsteinarena.run=$run_id" \
      --format 'table {{.Names}}\t{{.Status}}\t{{.RunningFor}}'
    ;;
  logs)
    printf -v index "%02d" "$((10#${4:?agent number is required}))"
    docker logs --follow "collab-${3:?arm is required}-$run_id-$index"
    ;;
  *)
    echo "$usage" >&2
    exit 1
    ;;
esac
