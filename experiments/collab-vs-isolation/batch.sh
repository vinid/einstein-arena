#!/usr/bin/env bash
# Runs <prefix><first>..<prefix><count> of one task back to back (first defaults to 1), e.g. ./batch.sh snake sn 40. Keeps the Mac awake for the whole batch.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
task="${1:?usage: $0 <task> <prefix> <count>}"
prefix="${2:?usage: $0 <task> <prefix> <count>}"
count="${3:?usage: $0 <task> <prefix> <count>}"
first="${4:-1}"
mkdir -p runs
caffeinate -dimsu -w $$ &
for n in $(seq "$first" "$count"); do
  run=$(printf "%s%02d" "$prefix" "$n")
  ./run.sh "$task" "$run" >"runs/$run.log" 2>&1
  sleep 30
done
