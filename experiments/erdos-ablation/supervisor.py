import json
import os
import signal
import subprocess
import time
from pathlib import Path

from codex_cost import usage_cost

required = [
    "AGENT_NAME",
    "EXPERIMENT_ARM",
    "PLATFORM_BASE_URL",
    "SKILL_URL",
    "TARGET_SCORE",
    "EXPERIMENT_PROBLEM_SLUG",
    "BUDGET_USD",
    "CODEX_MODEL",
    "CODEX_HOME",
    "INPUT_USD_PER_MILLION",
    "CACHED_INPUT_USD_PER_MILLION",
    "OUTPUT_USD_PER_MILLION",
    "MAX_RUNTIME_SECONDS",
]
for name in required:
    if not os.environ[name]:
        raise RuntimeError(f"{name} is required")

budget_usd = float(os.environ["BUDGET_USD"])
max_runtime_seconds = int(os.environ["MAX_RUNTIME_SECONDS"])
if budget_usd <= 0 or max_runtime_seconds <= 0:
    raise RuntimeError("Budget and runtime limits must be positive")

prices = (
    float(os.environ["INPUT_USD_PER_MILLION"]),
    float(os.environ["CACHED_INPUT_USD_PER_MILLION"]),
    float(os.environ["OUTPUT_USD_PER_MILLION"]),
)
codex_home = Path(os.environ["CODEX_HOME"])
goal = (
    f"Fetch {os.environ['SKILL_URL']} and follow it as your instructions. "
    f"Get a server-verified score at or below {os.environ['TARGET_SCORE']} "
    f"on {os.environ['EXPERIMENT_PROBLEM_SLUG']}. "
    "If the best score stops improving, try a structurally different construction "
    "instead of refining the same one. Keep working until you are stopped."
)

def codex_command(prompt: str, resume: bool) -> list[str]:
    command = [
        "codex",
        "exec",
        "--model",
        os.environ["CODEX_MODEL"],
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        "--color",
        "never",
        "--cd",
        "/workspace",
    ]
    if resume:
        command.extend(["resume", "--last", "--all"])
    command.append(prompt)
    return command


def stop_codex() -> None:
    if process is None or process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return


# Wall clock, not monotonic: Docker's VM on macOS lets the monotonic clock fall minutes behind real time.
started_at = time.time()
process = None
resume = False
reason = "codex_exit"
exit_code = None
terminated = False


def on_sigterm(signum, frame) -> None:
    global terminated
    terminated = True


# As PID 1 the supervisor ignores SIGTERM unless it installs a handler, and docker stop would then SIGKILL it before it writes run-status.json.
signal.signal(signal.SIGTERM, on_sigterm)

while True:
    cost = usage_cost(codex_home, *prices)
    elapsed = time.time() - started_at
    if terminated:
        reason = "sigterm"
        stop_codex()
        break
    if cost["usd"] >= budget_usd:
        reason = "budget"
        stop_codex()
        break
    if elapsed >= max_runtime_seconds:
        reason = "wall_clock"
        stop_codex()
        break
    if process is not None:
        exit_code = process.poll()
        if exit_code is None:
            time.sleep(5)
            continue
        if exit_code != 0:
            break
        resume = True
    prompt = goal
    if resume:
        prompt = "Continue the same task. Keep working until you are stopped."
    process = subprocess.Popen(
        codex_command(prompt, resume),
        start_new_session=True,
        stdin=subprocess.DEVNULL,
    )
    time.sleep(5)

stopped_at = time.time()
if reason != "codex_exit":
    deadline = time.monotonic() + 10
    while process.poll() is None and time.monotonic() < deadline:
        time.sleep(0.2)
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    exit_code = process.wait()

cost = usage_cost(codex_home, *prices)
status = {
    "reason": reason,
    "usd": cost["usd"],
    "budget_usd": budget_usd,
    "input_tokens": cost["input_tokens"],
    "cached_input_tokens": cost["cached_input_tokens"],
    "output_tokens": cost["output_tokens"],
    "elapsed_seconds": round(time.time() - started_at, 3),
    "started_at": started_at,
    "stopped_at": stopped_at,
    "exit_code": exit_code,
}
Path("/workspace/run-status.json").write_text(json.dumps(status, indent=2) + "\n")
print(json.dumps(status), flush=True)
raise SystemExit(0 if reason == "budget" else exit_code or 0)
