#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="einsteinarena-erdos-agent:0.1"
PROXY_IMAGE="einsteinarena-erdos-proxy:0.1"
LEGACY_NETWORK="einsteinarena-erdos-agents"
LEGACY_PROXY="einsteinarena-erdos-proxy"
ARMS=(single isolated collaborative)

arm_network() {
  echo "einsteinarena-erdos-agents-$1"
}

arm_proxy() {
  echo "einsteinarena-erdos-proxy-$1"
}

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing $ROOT/.env" >&2
  exit 1
fi

set -a
source "$ROOT/.env"
set +a

: "${CODEX_MODEL:?CODEX_MODEL is required}"
: "${CODEX_REASONING_EFFORT:?CODEX_REASONING_EFFORT is required}"
: "${OPENAI_API_KEY:?OPENAI_API_KEY is required}"
: "${TARGET_SCORE:?TARGET_SCORE is required}"
: "${EXPERIMENT_PROBLEM_SLUG:?EXPERIMENT_PROBLEM_SLUG is required}"
: "${AGENT_BUDGET_USD:?AGENT_BUDGET_USD is required}"
: "${SINGLE_BUDGET_USD:?SINGLE_BUDGET_USD is required}"
: "${INPUT_USD_PER_MILLION:?INPUT_USD_PER_MILLION is required}"
: "${CACHED_INPUT_USD_PER_MILLION:?CACHED_INPUT_USD_PER_MILLION is required}"
: "${OUTPUT_USD_PER_MILLION:?OUTPUT_USD_PER_MILLION is required}"
: "${MAX_RUNTIME_SECONDS:?MAX_RUNTIME_SECONDS is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AGENT_CPUS:?AGENT_CPUS is required}"
: "${AGENT_MEMORY:?AGENT_MEMORY is required}"
: "${AGENT_COUNT:?AGENT_COUNT is required}"

action="${1:-}"

if [[ "$action" == "build" ]]; then
  docker build --tag "$IMAGE" "$ROOT"
  docker build --file "$ROOT/Dockerfile.proxy" --tag "$PROXY_IMAGE" "$ROOT"
  exit 0
fi

ensure_proxy() {
  local arm="$1"
  local network proxy squid
  network="$(arm_network "$arm")"
  proxy="$(arm_proxy "$arm")"
  squid="$ROOT/squid-${arm}.conf"

  if [[ ! -f "$squid" ]]; then
    echo "Missing $squid" >&2
    exit 1
  fi

  if [[ -z "$(docker network ls --quiet --filter "name=^${network}$")" ]]; then
    docker network create --internal "$network"
  fi

  proxy_id="$(docker ps --all --quiet --filter "name=^/${proxy}$")"
  if [[ -z "$proxy_id" ]]; then
    docker run --detach \
      --name "$proxy" \
      --network bridge \
      --add-host host.docker.internal:host-gateway \
      --label "einsteinarena.experiment=erdos-ablation" \
      --label "einsteinarena.arm=$arm" \
      --mount "type=bind,source=$squid,target=/etc/squid/squid.conf,readonly" \
      "$PROXY_IMAGE"
    docker network connect --alias "$proxy" --alias "$LEGACY_PROXY" "$network" "$proxy"
  elif [[ -z "$(docker ps --quiet --filter "name=^/${proxy}$")" ]]; then
    docker start "$proxy"
  fi

  network_members="$(docker network inspect "$network" --format '{{range .Containers}}{{.Name}} {{end}}')"
  if [[ "$network_members" != *"$proxy"* ]]; then
    docker network connect --alias "$proxy" --alias "$LEGACY_PROXY" "$network" "$proxy"
  fi
}

if [[ "$action" == "network-start" ]]; then
  for arm_name in "${ARMS[@]}"; do
    ensure_proxy "$arm_name"
  done
  exit 0
fi

if [[ "$action" == "network-stop" ]]; then
  for arm_name in "${ARMS[@]}"; do
    proxy="$(arm_proxy "$arm_name")"
    network="$(arm_network "$arm_name")"
    if [[ -n "$(docker ps --all --quiet --filter "name=^/${proxy}$")" ]]; then
      docker rm --force "$proxy"
    fi
    if [[ -n "$(docker network ls --quiet --filter "name=^${network}$")" ]]; then
      docker network rm "$network"
    fi
  done
  if [[ -n "$(docker ps --all --quiet --filter "name=^/${LEGACY_PROXY}$")" ]]; then
    docker rm --force "$LEGACY_PROXY"
  fi
  if [[ -n "$(docker network ls --quiet --filter "name=^${LEGACY_NETWORK}$")" ]]; then
    docker network rm "$LEGACY_NETWORK"
  fi
  exit 0
fi

arm="${2:-}"
run_id="${3:-}"
if [[ -z "$arm" || -z "$run_id" ]]; then
  echo "Usage: $0 build|network-start|network-stop | $0 start|stop|harvest|clean|status <single|isolated|collaborative> <run-id> [agent-index]" >&2
  exit 1
fi
if [[ ! "$run_id" =~ ^[a-z0-9][a-z0-9_]{0,19}$ ]]; then
  echo "run-id must be 1-20 lowercase letters, digits, or underscores" >&2
  exit 1
fi

case "$arm" in
  single)
    arm_code="s"
    count=1
    port=3001
    skill="skill-single.md"
    budget_usd="$SINGLE_BUDGET_USD"
    ;;
  isolated)
    arm_code="i"
    count="$AGENT_COUNT"
    port=3002
    skill="skill-single.md"
    budget_usd="$AGENT_BUDGET_USD"
    ;;
  collaborative)
    arm_code="c"
    count="$AGENT_COUNT"
    port=3003
    skill="skill-collaborative.md"
    budget_usd="$AGENT_BUDGET_USD"
    ;;
  *)
    echo "Unknown arm: $arm" >&2
    exit 1
    ;;
esac

label_args=(
  --filter "label=einsteinarena.experiment=erdos-ablation"
  --filter "label=einsteinarena.arm=$arm"
  --filter "label=einsteinarena.run=$run_id"
)

case "$action" in
  start)
    curl --fail --silent --show-error "http://localhost:${port}/${skill}" >/dev/null
    docker image inspect "$IMAGE" >/dev/null
    docker image inspect "$PROXY_IMAGE" >/dev/null
    ensure_proxy "$arm"
    network="$(arm_network "$arm")"
    proxy="$(arm_proxy "$arm")"

    for number in $(seq 1 "$count"); do
      printf -v index "%02d" "$number"
      agent_name="ea-${arm_code}-${run_id}-${index}"
      container_name="erdos-${arm}-${run_id}-${index}"
      workspace="$ROOT/runs/$run_id/$arm/agent-$index"
      mkdir -p "$workspace"

      docker run --detach --interactive --tty --init \
        --name "$container_name" \
        --hostname "$container_name" \
        --label "einsteinarena.experiment=erdos-ablation" \
        --label "einsteinarena.arm=$arm" \
        --label "einsteinarena.run=$run_id" \
        --cpus "$AGENT_CPUS" \
        --memory "$AGENT_MEMORY" \
        --network "$network" \
        --mount "type=bind,source=$workspace,target=/workspace" \
        --env "OPENAI_API_KEY=$OPENAI_API_KEY" \
        --env "HTTP_PROXY=http://$proxy:3128" \
        --env "HTTPS_PROXY=http://$proxy:3128" \
        --env "http_proxy=http://$proxy:3128" \
        --env "https_proxy=http://$proxy:3128" \
        --env "NO_PROXY=localhost,127.0.0.1,$proxy" \
        --env "no_proxy=localhost,127.0.0.1,$proxy" \
        --env "AGENT_NAME=$agent_name" \
        --env "EXPERIMENT_ARM=$arm" \
        --env "PLATFORM_BASE_URL=http://host.docker.internal:$port" \
        --env "SKILL_URL=http://host.docker.internal:$port/$skill" \
        --env "TARGET_SCORE=$TARGET_SCORE" \
        --env "EXPERIMENT_PROBLEM_SLUG=$EXPERIMENT_PROBLEM_SLUG" \
        --env "BUDGET_USD=$budget_usd" \
        --env "INPUT_USD_PER_MILLION=$INPUT_USD_PER_MILLION" \
        --env "CACHED_INPUT_USD_PER_MILLION=$CACHED_INPUT_USD_PER_MILLION" \
        --env "OUTPUT_USD_PER_MILLION=$OUTPUT_USD_PER_MILLION" \
        --env "MAX_RUNTIME_SECONDS=$MAX_RUNTIME_SECONDS" \
        --env "CODEX_MODEL=$CODEX_MODEL" \
        --env "CODEX_REASONING_EFFORT=$CODEX_REASONING_EFFORT" \
        "$IMAGE"
    done
    ;;
  stop)
    docker ps --quiet "${label_args[@]}" | while read -r container; do
      # The supervisor needs up to ~15 s after SIGTERM to stop Codex and write run-status.json.
      [[ -n "$container" ]] && docker stop --time 30 "$container"
    done
    ;;
  harvest)
    if [[ -n "$(docker ps --quiet "${label_args[@]}")" ]]; then
      echo "Stop $arm $run_id before harvesting" >&2
      exit 1
    fi
    "$ROOT/../../web/.venv/bin/python" "$ROOT/harvest.py" "$run_id" "$arm"
    ;;
  clean)
    docker ps --all --quiet "${label_args[@]}" | while read -r container; do
      [[ -n "$container" ]] && docker rm --force "$container"
    done
    ;;
  status)
    docker ps --all "${label_args[@]}" \
      --format 'table {{.Names}}\t{{.Status}}\t{{.RunningFor}}'
    ;;
  logs)
    index="${4:-}"
    if [[ -z "$index" ]]; then
      echo "Agent index is required for logs" >&2
      exit 1
    fi
    printf -v padded_index "%02d" "$((10#$index))"
    docker logs --follow "erdos-${arm}-${run_id}-${padded_index}"
    ;;
  *)
    echo "Usage: $0 build|network-start|network-stop | $0 start|stop|harvest|clean|status <single|isolated|collaborative> <run-id> [agent-index]" >&2
    exit 1
    ;;
esac
