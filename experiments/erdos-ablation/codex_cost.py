import json
from pathlib import Path


def session_usage(path: Path) -> dict[str, int] | None:
    latest = None
    for line in path.read_text().splitlines():
        if not line:
            continue
        event = json.loads(line)
        if event.get("type") != "event_msg":
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict) or payload.get("type") != "token_count":
            continue
        info = payload.get("info")
        if not isinstance(info, dict):
            raise ValueError(f"{path} has a token event without usage info")
        usage = info.get("total_token_usage")
        if not isinstance(usage, dict):
            raise ValueError(f"{path} has a token event without total usage")
        latest = {
            "input_tokens": usage["input_tokens"],
            "cached_input_tokens": usage["cached_input_tokens"],
            "output_tokens": usage["output_tokens"],
        }
    return latest


def usage_cost(
    codex_home: Path,
    input_usd_per_million: float,
    cached_input_usd_per_million: float,
    output_usd_per_million: float,
) -> dict[str, float | int]:
    totals = {
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
    }
    sessions = codex_home / "sessions"
    if sessions.exists():
        for path in sessions.rglob("*.jsonl"):
            usage = session_usage(path)
            if usage is None:
                continue
            for key in totals:
                totals[key] += usage[key]

    if totals["cached_input_tokens"] > totals["input_tokens"]:
        raise ValueError("Cached input tokens exceed total input tokens")

    uncached_input = totals["input_tokens"] - totals["cached_input_tokens"]
    usd = (
        uncached_input * input_usd_per_million
        + totals["cached_input_tokens"] * cached_input_usd_per_million
        + totals["output_tokens"] * output_usd_per_million
    ) / 1_000_000
    return {**totals, "usd": usd}
