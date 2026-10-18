import json
import os
import re
from datetime import datetime
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parent.parent
DB = "postgresql://sciencebook:sciencebook@localhost:55432/experiment_{}"
PRICES = [float(os.environ[k]) for k in ("INPUT_USD_PER_MILLION", "CACHED_INPUT_USD_PER_MILLION", "OUTPUT_USD_PER_MILLION")]
ARMS = {"isolated": "i", "collaborative": "c"}


# Agents are named agent-NN on both platforms; the report labels them by arm and run.
def label(run: str, letter: str, agent: str) -> str:
    return f"ea-{letter}-{run}-{agent[-2:]}" if re.fullmatch(r"agent-\d\d", agent) else agent
_score_cache: dict[tuple[str, float, int], float | None] = {}


def ts(value) -> float:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value.timestamp()


def query(db: str, sql: str) -> list[tuple]:
    with psycopg2.connect(DB.format(db)) as conn, conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def session_file(codex_home: Path) -> Path | None:
    # A just-started agent has no session yet; the live view must still render.
    sessions = list((codex_home / "sessions").rglob("*.jsonl")) if (codex_home / "sessions").exists() else []
    if len(sessions) > 1:
        raise ValueError(f"{codex_home} has {len(sessions)} sessions")
    return sessions[0] if sessions else None


def spend(session: Path | None) -> list[tuple[float, float]]:
    if session is None:
        return []
    points = []
    for line in session.read_text().splitlines():
        if not line:
            continue
        event = json.loads(line)
        if event["type"] != "event_msg" or event["payload"]["type"] != "token_count":
            continue
        usage = event["payload"]["info"]["total_token_usage"]
        cached = usage["cached_input_tokens"]
        usd = ((usage["input_tokens"] - cached) * PRICES[0] + cached * PRICES[1] + usage["output_tokens"] * PRICES[2]) / 1e6
        points.append((ts(event["timestamp"]), usd))
    return points


def last_message(session: Path | None) -> str | None:
    if session is None:
        return None
    message = None
    for line in session.read_text().splitlines():
        if not line:
            continue
        event = json.loads(line)
        if event["type"] == "event_msg" and event["payload"]["type"] == "agent_message":
            message = " ".join(event["payload"]["message"].split())
    return message


def load_verifier():
    namespace: dict = {}
    exec((Path(os.environ["EXPERIMENT_TASK_DIR"]) / "verifier.py").read_text(), namespace)
    return namespace["evaluate"]


# Every task's solution is one list (edges, sequences or colourings), and its score is at most the list's length.
def saved_solutions(workspace: Path, cutoff: float = float("inf")) -> list[tuple[int, Path, dict]]:
    (field,) = json.loads((Path(os.environ["EXPERIMENT_TASK_DIR"]) / "problem.json").read_text())["solutionSchema"]
    found = []
    for path in workspace.rglob("*.json"):
        if "codex-state" in path.parts or "seeds" in path.parts or not path.is_file() or path.stat().st_mtime > cutoff:
            continue
        try:
            solution = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            continue
        if isinstance(solution, dict) and isinstance(solution.get(field), list):
            found.append((len(solution[field]), path, solution))
    found.sort(key=lambda item: item[0], reverse=True)
    return found


def local_best(workspace: Path, evaluate) -> dict | None:
    best = None
    for bound, path, solution in saved_solutions(workspace):
        if best is not None and bound <= best[0]:
            break
        stat = path.stat()
        key = (str(path), stat.st_mtime, stat.st_size)
        if key not in _score_cache:
            try:
                _score_cache[key] = evaluate(solution)
            except Exception:
                _score_cache[key] = None
        score = _score_cache[key]
        if score is not None and (best is None or score > best[0]):
            best = (score, path, stat.st_mtime)
    if best is None:
        return None
    return {"score": best[0], "file": str(best[1].relative_to(workspace)), "mtime": best[2]}


# Tool outputs show posts as JSON, Python reprs or plain prints, so both sides are reduced to lowercase alphanumerics.
def normalize(text: str) -> str:
    text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
    text = re.sub(r"\\[nrt\"\\/']", " ", text)
    return re.sub(r"[^a-z0-9]", "", text.lower())


def tool_outputs(session: Path | None) -> list[tuple[float, str]]:
    if session is None:
        return []
    outputs = []
    for line in session.read_text().splitlines():
        if not line:
            continue
        event = json.loads(line)
        if event["type"] == "response_item" and event["payload"]["type"] in ("function_call_output", "custom_tool_call_output"):
            outputs.append((ts(event["timestamp"]), normalize(str(event["payload"]["output"]))))
    return outputs


# A post counts as read once its last 50 characters reach the agent's context; thread lists alone only show the first 200.
def post_reads(run: str, letter: str, db: str) -> list[dict]:
    posts = [(label(run, letter, author), ts(created), normalize(body)) for author, created, body in query(db, """
        select agent_name, created_at, title || ' ' || body from threads
        union all select agent_name, created_at, body from replies""")]
    counts: dict[tuple[str, str], int] = {}
    for agent_dir in sorted((ROOT / "runs" / run / "collaborative").glob("agent-*")):
        reader = f"ea-{letter}-{run}-{agent_dir.name.split('-')[1]}"
        outputs = tool_outputs(session_file(agent_dir / "codex-state"))
        for author, created, body in posts:
            if author != reader and any(t >= created and body[-50:] in o for t, o in outputs):
                counts[(reader, author)] = counts.get((reader, author), 0) + 1
    return [{"reader": r, "owner": o, "n": n} for (r, o), n in counts.items()]


# "publish" for posters, which publish but never read; True otherwise.
def platform_access(arm: str, agent_dir: Path):
    text = (agent_dir / "codex-state" / "AGENTS.md").read_text()
    return "publish" if arm == "collaborative" and "## Publish Notes" in text else True


def collect(run: str) -> dict:
    evaluate = load_verifier()
    approach_file = ROOT / "runs" / run / "approaches.json"
    # Hand-written labels are added after reading the run, so early views have none.
    approaches = json.loads(approach_file.read_text()) if approach_file.exists() else {}
    agents, submissions, posts, reads = [], [], [], []
    for arm, letter in ARMS.items():
        db = f"{run}_{arm}"
        for agent_dir in sorted((ROOT / "runs" / run / arm).glob("agent-*")):
            name = f"ea-{letter}-{run}-{agent_dir.name.split('-')[1]}"
            session = session_file(agent_dir / "codex-state")
            status_file = agent_dir / "run-status.json"
            agents.append({
                "name": name, "arm": arm, "approach": approaches.get(name, "—"),
                "platform": platform_access(arm, agent_dir),
                "start": ts(json.loads(session.read_text().splitlines()[0])["timestamp"]) if session else None,
                "spend": spend(session),
                "localBest": local_best(agent_dir, evaluate),
                "lastMessage": last_message(session),
                "stopped": json.loads(status_file.read_text())["reason"] if status_file.exists() else None,
            })
        for agent, created, score, harvest in query(db, "select agent_name, created_at, score, coalesce(code like 'harvest:%', false) from solutions where status in ('evaluated', 'rejected') and coalesce(code, '') not like 'seed:%' order by created_at"):
            submissions.append({"arm": arm, "agent": label(run, letter, agent), "t": ts(created), "score": score, "harvest": harvest})
        for agent, created, body, kind in query(db, """
            select agent_name, created_at, title || ': ' || body, 'thread' from threads
            union all select agent_name, created_at, body, 'reply' from replies order by 2"""):
            text = re.sub(r"\s+", " ", body)
            agent = label(run, letter, agent)
            cites = sorted({label(run, letter, a) for a in re.findall(r"agent-\d\d", text)} - {agent})
            posts.append({"arm": arm, "agent": agent, "t": ts(created), "text": text[:2000], "kind": kind, "cites": cites})
        for reader, owner, n in query(db, """
            select e.agent_name, s.agent_name, count(*) from agent_events e
            cross join lateral jsonb_array_elements_text(e.metadata->'solution_ids') sid
            join solutions s on s.id = sid::int
            where e.event_type = 'shared_solutions_read' and s.agent_name <> e.agent_name
              and coalesce(s.code, '') not like 'seed:%' group by 1, 2"""):
            reads.append({"reader": label(run, letter, reader), "owner": label(run, letter, owner), "n": n})
    forum_reads = post_reads(run, ARMS["collaborative"], f"{run}_collaborative")
    starts = [a["start"] for a in agents if a["start"] is not None]
    return {"run": run, "problem": os.environ["EXPERIMENT_PROBLEM_SLUG"],
            "scoring": os.environ["EXPERIMENT_SCORING"],
            "target": float(os.environ["TARGET_SCORE"]),
            "t0": min(starts) if starts else None, "agents": agents,
            "submissions": submissions, "posts": posts, "reads": reads, "postReads": forum_reads}
