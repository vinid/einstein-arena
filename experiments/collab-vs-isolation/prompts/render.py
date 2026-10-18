"""Renders the exact AGENTS.md and goal prompt of every agent.

Agent N gets the same persona, seed and resources in both arms. The arms differ only by role:
  isolated  every isolated agent: skill-isolated.md
  poster    collaborative agents not in EXPERIMENT_PLATFORM_SLOTS: skill-publish.md, and their notes are also published
  reader    collaborative agents in EXPERIMENT_PLATFORM_SLOTS: skill-collaborative.md, and one paragraph saying the platform exists

  python prompts/render.py <task> <out-dir>   write <out-dir>/<arm>-<NN>/AGENTS.md and goal.md for every agent
  python prompts/render.py <task> --diff      print, for each agent number, how the collaborative prompts differ from the isolated ones
  python prompts/render.py <task> --check     fail unless the arms differ only in the role text above
"""
import difflib
import json
import shlex
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROMPTS = ROOT / "prompts"
ARMS = ("isolated", "collaborative")
SKILLS = {"isolated": "skill-isolated.md", "poster": "skill-publish.md", "reader": "skill-collaborative.md"}

# Only states that the platform exists; no schedule, thresholds or behavior rules.
PLATFORM_SECTION = """
## Platform
Other agents work on this problem at the same time. Their submitted solutions and threads are on this platform.
"""


def load_env(task: str) -> dict[str, str]:
    env = {}
    for path in (ROOT / "config.env", ROOT / "tasks" / task / "task.env"):
        for line in path.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                env[key.strip()] = " ".join(shlex.split(value))
    return env


def role(arm: str, number: int, env: dict[str, str]) -> str:
    if arm == "isolated":
        return "isolated"
    return "reader" if str(number) in env["EXPERIMENT_PLATFORM_SLOTS"].split() else "poster"


def render(task: str, arm: str, number: int, env: dict[str, str]) -> tuple[str, str]:
    task_dir = ROOT / "tasks" / task
    problem = json.loads((task_dir / "problem.json").read_text())
    agent_role = role(arm, number, env)
    seed_name = f"seed-{number}.json"
    seed_score = json.loads((task_dir / "seeds" / "index.json").read_text())[seed_name]
    memory = env["AGENT_MEMORY"]
    goal = (PROMPTS / "goal.md").read_text().format(
        slug=problem["slug"],
        direction={"maximize": "Higher", "minimize": "Lower"}[problem["scoring"]],
        target=env["TARGET_SCORE"],
        persona=env["EXPERIMENT_PERSONAS"].split("|")[number - 1].strip(),
        cpus=env["AGENT_CPUS"],
        core_word="core" if env["AGENT_CPUS"] == "1" else "cores",
        memory=f"{memory[:-1]} {({'m': 'MB', 'g': 'GB'})[memory[-1].lower()]}",
        seed_name=seed_name,
        seed_score=f"{seed_score:g}",
        platform_section=PLATFORM_SECTION if agent_role == "reader" else "",
        jump=env["EXPERIMENT_JUMP"],
        notes_destination=(
            "to /workspace/notes.md and publish it on the platform (see Publish Notes)"
            if agent_role == "poster" else "to /workspace/notes.md"
        ),
        plateau_action="write and publish" if agent_role == "poster" else "write",
    )
    return (PROMPTS / SKILLS[agent_role]).read_text(), goal


POSTER_PHRASES = [
    ("to /workspace/notes.md and publish it on the platform (see Publish Notes)", "to /workspace/notes.md"),
    ("write and publish the plateau", "write the plateau"),
]


def parity_errors(task: str, env: dict[str, str]) -> list[str]:
    """Agent N's collaborative prompts must equal its isolated prompts plus the role text: the platform paragraph for
    readers, the publish phrases for posters, the skill's opening paragraph, and added skill sections."""
    errors = []
    for number in range(1, int(env["AGENT_COUNT"]) + 1):
        agent_role = role("collaborative", number, env)
        (iso_skill, iso_goal), (col_skill, col_goal) = render(task, "isolated", number, env), render(task, "collaborative", number, env)
        base = col_goal.replace(PLATFORM_SECTION, "") if agent_role == "reader" else col_goal
        if agent_role == "poster":
            for new, old in POSTER_PHRASES:
                base = base.replace(new, old)
        if base != iso_goal:
            errors.append(f"agent {number:02d} ({agent_role}): goal differs beyond the role text")
        iso_lines, col_lines = iso_skill.splitlines(), col_skill.splitlines()
        for tag, i1, i2, _, _ in difflib.SequenceMatcher(None, iso_lines, col_lines, autojunk=False).get_opcodes():
            if tag in ("replace", "delete") and not (tag == "replace" and (i1, i2) == (2, 3)):
                errors.append(f"agent {number:02d} ({agent_role}): skill changes isolated lines {i1 + 1}-{i2}")
    return errors


def main() -> None:
    task, target = sys.argv[1], sys.argv[2]
    env = load_env(task)
    count = int(env["AGENT_COUNT"])
    if target == "--check":
        errors = parity_errors(task, env)
        print("\n".join(errors) if errors else f"{task}: prompts differ between arms only in the role text")
        raise SystemExit(1 if errors else 0)
    if target != "--diff":
        for arm in ARMS:
            for number in range(1, count + 1):
                out = Path(target) / f"{arm}-{number:02d}"
                out.mkdir(parents=True, exist_ok=True)
                skill, goal = render(task, arm, number, env)
                (out / "AGENTS.md").write_text(skill)
                (out / "goal.md").write_text(goal)
        return
    for number in range(1, count + 1):
        print(f"### agent {number:02d}: isolated vs collaborative ({role('collaborative', number, env)})")
        iso, col = render(task, "isolated", number, env), render(task, "collaborative", number, env)
        for name, a, b in (("goal.md", iso[1], col[1]), ("AGENTS.md", iso[0], col[0])):
            diff = list(difflib.unified_diff(a.splitlines(), b.splitlines(), f"isolated/{name}", f"collaborative/{name}", n=0, lineterm=""))
            print("\n".join(diff) if diff else f"{name}: identical")
        print()


if __name__ == "__main__":
    main()
