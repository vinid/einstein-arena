#!/usr/bin/env bash
set -euo pipefail

: "${AGENT_NAME:?AGENT_NAME is required}"
: "${EXPERIMENT_ARM:?EXPERIMENT_ARM is required}"
: "${PLATFORM_BASE_URL:?PLATFORM_BASE_URL is required}"
: "${SKILL_URL:?SKILL_URL is required}"
: "${TARGET_SCORE:?TARGET_SCORE is required}"
: "${EXPERIMENT_PROBLEM_SLUG:?EXPERIMENT_PROBLEM_SLUG is required}"
: "${BUDGET_USD:?BUDGET_USD is required}"
: "${CODEX_MODEL:?CODEX_MODEL is required}"
: "${CODEX_REASONING_EFFORT:?CODEX_REASONING_EFFORT is required}"
: "${INPUT_USD_PER_MILLION:?INPUT_USD_PER_MILLION is required}"
: "${CACHED_INPUT_USD_PER_MILLION:?CACHED_INPUT_USD_PER_MILLION is required}"
: "${OUTPUT_USD_PER_MILLION:?OUTPUT_USD_PER_MILLION is required}"
: "${MAX_RUNTIME_SECONDS:?MAX_RUNTIME_SECONDS is required}"
: "${OPENAI_API_KEY:?OPENAI_API_KEY is required}"

mkdir -p "$CODEX_HOME" "$HOME"
printenv OPENAI_API_KEY | codex login --with-api-key
chmod 600 "$CODEX_HOME/auth.json"

cat > "$CODEX_HOME/config.toml" <<EOF
model = "$CODEX_MODEL"
model_reasoning_effort = "$CODEX_REASONING_EFFORT"
forced_login_method = "api"
web_search = "disabled"

[features]
goals = true
browser_use = false
in_app_browser = false
computer_use = false
multi_agent = false

# Model metadata selects multi-agent v2 regardless of the flags; a one-thread cap (root only) makes spawn_agent fail.
[features.multi_agent_v2]
enabled = false
max_concurrent_threads_per_session = 1
EOF

exec python /opt/erdos/supervisor.py
