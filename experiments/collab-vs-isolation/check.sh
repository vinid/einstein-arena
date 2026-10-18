#!/usr/bin/env bash
# Preflight for one task, without any Codex agent: prompt parity between arms, then one probe container per arm with an
# agent's exact settings, which checks resources, network isolation and what each arm's platform exposes.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

task="${1:?usage: $0 <task>}"
load_task "$task"
run_id="chk$(date +%m%d%H%M%S)"
run_dir="$ROOT/runs/$run_id"
mkdir -p "$run_dir"
echo "$task" >"$run_dir/task"
cd "$ROOT"

cleanup() {
  docker ps --all --quiet --filter "label=einsteinarena.run=$run_id" | while read -r container; do
    docker rm --force "$container" >/dev/null
  done
  for arm in "${ARMS[@]}"; do
    ./platform.sh stop "$arm"
    docker exec web-postgres-1 dropdb -U sciencebook --if-exists "experiment_${run_id}_${arm}"
  done
}
trap cleanup EXIT

echo "== prompts"
"$PYTHON" prompts/render.py "$task" --check
"$PYTHON" prompts/render.py "$task" "$run_dir/prompts"

echo "== verifier"
"$PYTHON" - <<'PY'
import json, os
from pathlib import Path
task = Path(os.environ["EXPERIMENT_TASK_DIR"])
namespace = {}
exec((task / "verifier.py").read_text(), namespace)
for name, score in json.loads((task / "seeds" / "index.json").read_text()).items():
    got = namespace["evaluate"](json.loads((task / "seeds" / name).read_text()))
    assert got == score, f"{name}: verifier {got}, index {score}"
target = task / "target-solution.json"
if target.exists():
    got = namespace["evaluate"](json.loads(target.read_text()))
    assert got >= float(os.environ["TARGET_SCORE"]), f"target solution scores {got} < TARGET_SCORE"
    print(f"target solution scores {got:g} >= target {os.environ['TARGET_SCORE']}")
print("seeds score as listed in seeds/index.json")
PY

echo "== platforms"
for arm in "${ARMS[@]}"; do
  ./platform.sh stop "$arm"
  ./platform.sh start "$arm" "$run_id"
  # A solution by another agent with the probe's seed score: the probe must not be able to read it by its ID, and the tie
  # must not get the probe's seed rejected.
  docker exec web-postgres-1 psql -U sciencebook -d "experiment_${run_id}_${arm}" -tAc \
    "insert into solutions (problem_id, agent_name, status, data, score) values (1, 'other-agent', 'evaluated', '{}', $(jq '.["seed-1.json"]' "$EXPERIMENT_TASK_DIR/seeds/index.json")) returning id" \
    | head -1 >"$run_dir/other-solution-$arm"
done

echo "== probes"
./agents.sh probe "$run_id"
status=0
for arm in "${ARMS[@]}"; do
  container="collab-$arm-$run_id-01-probe"
  code="$(docker wait "$container")"
  docker logs "$container" 2>&1
  [[ "$code" == 0 ]] || status=1
done

echo "== containers"
# Both arms' probes must match in everything but the arm-specific network, proxy, platform URL and name.
for arm in "${ARMS[@]}"; do
  docker inspect "collab-$arm-$run_id-01-probe" --format \
    '{{.Image}} cpus={{.HostConfig.CpusetCpus}} memory={{.HostConfig.Memory}} init={{.HostConfig.Init}}{{println}}{{range .Config.Env}}{{println .}}{{end}}' \
    | sed -E 's/^(CHECK_[A-Z_]+|AGENT_NAME|PLATFORM_BASE_URL|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy|OPENAI_API_KEY)=.*/\1=<arm-specific>/' \
    | sed -E 's/cpus=[0-9-]+/cpus=<pinned>/' | sort >"$run_dir/container-$arm.txt"
done
if diff "$run_dir/container-isolated.txt" "$run_dir/container-collaborative.txt" >/dev/null; then
  echo "ok   both arms: same image, core count, memory, init and environment variables"
else
  echo "FAIL containers differ between arms:"
  diff "$run_dir/container-isolated.txt" "$run_dir/container-collaborative.txt" || true
  status=1
fi
for arm in "${ARMS[@]}"; do
  echo "     $arm cpus $(docker inspect "collab-$arm-$run_id-01-probe" --format '{{.HostConfig.CpusetCpus}}')"
done

if [[ "$status" == 0 ]]; then
  rm -rf "$run_dir"
  echo "== all checks passed for $task"
else
  echo "== CHECKS FAILED for $task; details in runs/$run_id"
fi
exit "$status"
