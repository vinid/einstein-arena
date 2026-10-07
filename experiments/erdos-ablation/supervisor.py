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
    "TARGET_SCORE",
    "EXPERIMENT_PROBLEM_SLUG",
    "EXPERIMENT_SCORING",
    "BUDGET_USD",
    "CODEX_MODEL",
    "CODEX_HOME",
    "INPUT_USD_PER_MILLION",
    "CACHED_INPUT_USD_PER_MILLION",
    "OUTPUT_USD_PER_MILLION",
    "MAX_RUNTIME_SECONDS",
    "AGENT_CPUS",
    "AGENT_MEMORY",
    "START_SCORE",
    "START_MODE",
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
memory = os.environ["AGENT_MEMORY"]
memory_text = f"{memory[:-1]} {({'m': 'MB', 'g': 'GB'})[memory[-1].lower()]}"
slug = os.environ["EXPERIMENT_PROBLEM_SLUG"]
higher_is_better = {"maximize": True, "minimize": False}[os.environ["EXPERIMENT_SCORING"]]

intro = "Your AGENTS.md has the instructions for this platform. Follow them."

task_section = f"""## Task
{slug}. {'Higher' if higher_is_better else 'Lower'} is better. The target is {os.environ['TARGET_SCORE']}. \
Keep improving your server-verified score."""

# "none" marks a fresh session; a continuation session starts from another session's best.
start_score = os.environ["START_SCORE"]
start_section = f"""## Start
Another session left its best solution in /workspace/seeds/start.json, with server-verified score {start_score}. \
Start from it."""
start_sections = [] if start_score == "none" else [start_section]

resources_section = f"""## Resources
{max_runtime_seconds // 60} minutes, {os.environ['AGENT_CPUS']} dedicated CPU \
core{'' if os.environ['AGENT_CPUS'] == '1' else 's'}, and {memory_text} of memory. \
Run analyses and optimizations as background processes that log their progress and save every improvement \
to /workspace/best.json and /workspace/history/<unix-seconds>.json. Keep at most two running at once, and check \
their logs while you think. Do not sleep to wait: while your jobs run, plan and write your next approach."""

platform_reading = """Read the shared solutions and new threads between your own search rounds. Never wait for other agents or for \
new posts."""

platform_posting = """Submit every new best right away. When a new best is a different construction or passes a plateau, post one \
thread with the construction, the exact score, the step that produced the jump, stated so that another agent can \
apply it to their own solution, and the obstruction that stops it from improving further, for example the exact \
defects left and why your method cannot remove them. That obstruction is the next puzzle for everyone. When you are stuck at a plateau, post the plateau and what you tried in one post, so that nobody repeats \
it. When another agent posts a plateau, take it as established and try something structurally different. Do not \
post status updates, plans, or acknowledgements.

Keep posts short and exact. Spend your time computing: reading and posting should take only a few minutes of \
the session."""

platform_section = f"""## Platform
Other agents work on this task at the same time as you.

{platform_reading}

{platform_posting}"""

# Matches the collaborative write-up step, so that an arm difference comes from sharing, not from reflection.
notes_section = """## Notes
When a new best is a different construction or passes a plateau, write the construction, the exact score, the \
step that produced the jump, and the obstruction that stops it from improving further to /workspace/notes.md, for \
example the exact defects left and why your method cannot remove them. When you are stuck at a plateau, write the plateau and what you tried. Read your \
notes before you choose a new approach. Keep notes short and exact."""

approach_section = """## Approach
When your line of work stops improving, switch to a structurally different approach. \
Keep working until you are stopped."""

# Lineages stay separate: when every trailing agent adopted the shared best, three searches became one and the arm polished a single basin.
collaborative_approach_section = """## Approach
Keep your own solution as your main line for the whole session. When a thread reports a step that gave another \
agent a jump, apply that step to your own solution; if it improves yours, submit it and reply to that thread with \
the result. Download another agent's solution only to try one structural change on it that its thread does not \
describe, a change of the construction rather than a refinement of it; then return to your own line. Do \
not polish another agent's solution: its author does that. When your line stops improving, switch to a structurally \
different approach that no thread describes. Keep working until you are stopped."""

sections = {
    "single": [intro, task_section, resources_section, notes_section, approach_section],
    "isolated": [intro, task_section, *start_sections, resources_section, notes_section, approach_section],
    "collaborative": [intro, task_section, resources_section, platform_section, collaborative_approach_section],
}[os.environ["EXPERIMENT_ARM"]]

# "fork" resumes a copied core session: both arms get the same pause notice, and only the collaborative copy learns of the platform.
start_mode = os.environ["START_MODE"]
if start_mode == "fork":
    pause_section = f"""## Pause
Your session was paused after {os.environ['PAUSED_MINUTES']} minutes and moved to a new machine. Your background \
processes have stopped, but your files in /workspace are intact: restart your searches from your saved solutions. \
Your agent name is now {os.environ['AGENT_NAME']} and the platform is at {os.environ['PLATFORM_BASE_URL']}; your saved \
credentials were moved to match, so update any script that uses the old name or address. You have \
{max_runtime_seconds // 60} more minutes, with the same CPU and memory as before."""
    fork_platform_section = f"""## Platform
From now on other agents work on this task with you on a shared platform. Your AGENTS.md now has its instructions. \
The shared solutions already hold every agent's submissions from before the pause.

{platform_reading}

{platform_posting}"""
    # The pause comes after independent search, so pooling onto the best line no longer collapses the arm into a weak early basin.
    fork_approach_section = """## Approach
Take the best solution on the board as your base, unless yours is the best. Apply to it the steps that gave you \
jumps before the pause and the steps other agents post. Submit every improvement right away and post the step \
that produced it, so that the others can apply it to the new best. Before each search round, check the board and \
move to the current best solution if another agent improved it. Keep working until you are stopped."""
    sections = {
        "isolated": [pause_section, approach_section],
        "collaborative": [pause_section, fork_platform_section, fork_approach_section],
    }[os.environ["EXPERIMENT_ARM"]]
elif start_mode != "fresh":
    raise RuntimeError(f"Unknown START_MODE {start_mode}")
goal = "\n\n".join(sections)

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
# A forked session carries the core's token history; budget and reported spend count only this container's share.
usd_before_start = usage_cost(codex_home, *prices)["usd"]
process = None
resume = start_mode == "fork"
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
    if cost["usd"] - usd_before_start >= budget_usd:
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
    if process is not None:
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
    "usd": cost["usd"] - usd_before_start,
    "usd_before_start": usd_before_start,
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
