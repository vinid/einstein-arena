#!/usr/bin/env python3
import argparse
import json
import os
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests

B = "\033[1m"
D = "\033[2m"
R = "\033[0m"
RED = "\033[91m"
GRN = "\033[92m"
YLW = "\033[93m"
BLU = "\033[94m"
MAG = "\033[95m"
CYN = "\033[96m"
WHT = "\033[97m"


def banner(title: str, lines: list[str]):
    w = 58
    print(f"\n {B}{CYN}{'━' * w}{R}")
    print(f" {B}{WHT} {title}{R}")
    for line in lines:
        print(f" {D} {line}{R}")
    print(f" {B}{CYN}{'━' * w}{R}")


def heading(text: str):
    print(f"\n {B}{MAG}{text}{R}")
    print(f" {D}{'─' * 56}{R}")


def block_bar(blocked: int, total: int, width: int = 10) -> str:
    if total == 0:
        return f"{D}{'░' * width}{R}"
    ratio = blocked / total
    filled = round(ratio * width)
    empty = width - filled
    if ratio >= 1.0:
        color = GRN
    elif ratio > 0.5:
        color = YLW
    else:
        color = RED
    return f"{color}{'█' * filled}{'░' * empty}{R}"


class GuardrailEvaluator:
    def __init__(self, base_url: str, api_key: str, bypass_token: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.bypass_token = bypass_token
        self.data = json.loads((Path(__file__).parent / "data.json").read_text())
        self.stats: dict[str, dict[str, int]] = defaultdict(lambda: {"sent": 0, "accepted": 0, "blocked": 0})

    def _url(self, p: str) -> str:
        return f"{self.base_url}{p}"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-RateLimit-Bypass": self.bypass_token,
        }

    def _post(self, path: str, payload: dict, timeout: int = 15) -> tuple[int, str]:
        try:
            resp = requests.post(self._url(path), headers=self._headers(), json=payload, timeout=timeout)
            return resp.status_code, resp.text
        except requests.exceptions.RequestException as e:
            return 0, str(e)

    def _get(self, path: str) -> dict:
        try:
            resp = requests.get(self._url(path), headers=self._headers(), timeout=10)
            return resp.json()
        except Exception:
            return {}

    def _record(self, category: str, accepted: bool):
        self.stats[category]["sent"] += 1
        self.stats[category]["accepted" if accepted else "blocked"] += 1

    def test_threads(self):
        heading("HARMFUL THREADS")
        slug = self.data["problem_slug"]
        threads = self.data["harmful_threads"]
        thread_ids: list[int] = []

        print(f"  {D}posting {len(threads)} harmful threads to {slug}{R}")
        for entry in threads:
            cat = entry["category"]
            code, body = self._post(f"/api/problems/{slug}/threads", {"title": entry["title"], "body": entry["body"]})
            accepted = 200 <= code < 300
            self._record(cat, accepted)

            if accepted:
                print(f"   {RED}✗ ACCEPTED{R}  {cat:<12} {entry['title'][:42]}  {RED}{code}{R}")
                try:
                    thread_ids.append(json.loads(body)["id"])
                except (json.JSONDecodeError, KeyError):
                    pass
            else:
                print(f"   {GRN}✓ BLOCKED {R}  {cat:<12} {entry['title'][:42]}  {D}{code}{R}")

        return thread_ids

    def test_replies(self, thread_ids: list[int]):
        heading("HARMFUL REPLIES")
        replies = self.data["harmful_replies"]
        rpt = self.data["replies_per_thread"]

        if not thread_ids:
            print(f"  {D}all harmful threads blocked — fetching existing threads{R}")
            slug = self.data["problem_slug"]
            data = self._get(f"/api/problems/{slug}/threads?limit={self.data['max_threads']}")
            threads_list = data if isinstance(data, list) else data.get("threads", data.get("data", []))  # noqa
            thread_ids = [t["id"] for t in threads_list[:self.data["max_threads"]]]

        if not thread_ids:
            print(f"  {RED}no threads available — skipping replies{R}")
            return

        total = rpt * len(thread_ids)
        print(f"  {D}posting {rpt} harmful replies to {len(thread_ids)} threads ({total} total){R}")

        for tid in thread_ids:
            ok = 0
            for j in range(rpt):
                entry = replies[(random.randint(0, 999) + j) % len(replies)]
                code, _ = self._post(f"/api/threads/{tid}/replies", {
                    "body": f"{entry['body']} [reply {j+1}/{rpt} thread {tid}]",
                    "parent_reply_id": None,
                })
                accepted = 200 <= code < 300
                self._record(entry["category"], accepted)
                if accepted:
                    ok += 1

            sym = f"{RED}✗{R}" if ok > 0 else f"{GRN}✓{R}"
            print(f"   {sym} thread {tid}: {ok}/{rpt} replies accepted")

    def test_mass_replies(self, thread_ids: list[int]):
        heading("MASS HARMFUL REPLIES")
        replies = self.data["harmful_replies"]
        rounds = self.data["mass_rounds"]
        max_t = self.data["max_threads"]

        if not thread_ids:
            slug = self.data["problem_slug"]
            data = self._get(f"/api/problems/{slug}/threads?limit={max_t}")
            threads_list = data if isinstance(data, list) else data.get("threads", data.get("data", []))  # noqa
            thread_ids = [t["id"] for t in threads_list[:max_t]]

        if not thread_ids:
            print(f"  {RED}no threads available{R}")
            return

        total = rounds * len(replies) * len(thread_ids)
        print(f"  {D}{rounds} rounds × {len(replies)} payloads × {len(thread_ids)} threads = {total} requests{R}")

        t0 = time.time()
        count = 0
        for rnd in range(1, rounds + 1):
            for tid in thread_ids:
                for entry in replies:
                    code, _ = self._post(f"/api/threads/{tid}/replies", {
                        "body": f"{entry['body']} [r={rnd} t={tid}]",
                        "parent_reply_id": None,
                    })
                    self._record(entry["category"], 200 <= code < 300)
                    count += 1
            elapsed = time.time() - t0
            rps = count / max(elapsed, 0.001)
            print(f"   {D}round {rnd}/{rounds} done ({count}/{total}, ~{rps:.0f} req/s){R}")

        elapsed = time.time() - t0
        print(f"  {D}{count} replies in {elapsed:.1f}s (~{count / max(elapsed, 0.001):.0f} req/s){R}")

    def report(self):
        categories = self.data["categories"]

        heading("CONTENT MODERATION REPORT")

        print(f"   {'CATEGORY':<12} {'SENT':>6}  {'ACCEPTED':>8}  {'BLOCKED':>7}  {'':>10}  STATUS")
        print(f"   {D}{'─' * 12}  {'─' * 6}  {'─' * 8}  {'─' * 7}  {'─' * 10}  {'─' * 14}{R}")

        grand_sent = grand_acc = 0
        weak: list[tuple[str, int, int]] = []

        for cat in categories:
            s = self.stats[cat]
            sent, acc, blk = s["sent"], s["accepted"], s["blocked"]
            grand_sent += sent
            grand_acc += acc

            bar = block_bar(blk, sent)

            if sent == 0:
                status = f"{D}N/A{R}"
            elif acc == 0:
                status = f"{GRN}{B}SECURE{R}"
            elif acc == sent:
                status = f"{RED}{B}VULNERABLE{R}"
                weak.append((cat, acc, sent))
            else:
                pct = acc * 100 // sent
                if pct >= 80:
                    status = f"{RED}VERY WEAK {pct}%{R}"
                    weak.append((cat, acc, sent))
                elif pct >= 50:
                    status = f"{YLW}WEAK {pct}%{R}"
                    weak.append((cat, acc, sent))
                else:
                    status = f"{YLW}PARTIAL {pct}%{R}"

            print(f"   {cat:<12} {sent:>6}  {acc:>8}  {blk:>7}  {bar}  {status}")

        print(f"   {D}{'─' * 12}  {'─' * 6}  {'─' * 8}  {'─' * 7}  {'─' * 10}  {'─' * 14}{R}")
        grand_blk = grand_sent - grand_acc
        gpct = (grand_acc * 100 // grand_sent) if grand_sent > 0 else 0
        print(f"   {B}{'TOTAL':<12} {grand_sent:>6}  {grand_acc:>8}  {grand_blk:>7}{R}  {block_bar(grand_blk, grand_sent)}")

        print()
        if grand_sent == 0:
            print(f"   {D}no payloads sent{R}")
        elif grand_acc == 0:
            print(f"   {GRN}{B}✓ ALL harmful content was blocked.{R}")
        elif grand_acc == grand_sent:
            print(f"   {RED}{B}✗ CRITICAL: platform accepted ALL harmful content — no moderation!{R}")
        else:
            print(f"   {YLW}⚠ {grand_acc}/{grand_sent} ({gpct}%) harmful payloads accepted{R}")
            if weak:
                for cat, acc, sent in sorted(weak, key=lambda x: -(x[1] * 100 // x[2])):
                    p = acc * 100 // sent
                    print(f"     {RED}→ {cat}: {acc}/{sent} ({p}%) needs filtering{R}")

        return grand_acc


def register_agent(base_url: str, bypass_token: str) -> str:
    name = f"GuardrailBot_{int(time.time())}"
    resp = requests.post(
        f"{base_url}/api/agents/register",
        headers={"Content-Type": "application/json", "X-RateLimit-Bypass": bypass_token},
        json={"name": name},
        timeout=10,
    )
    if resp.status_code != 201:
        print(f"{RED}Registration failed: HTTP {resp.status_code} {resp.text[:200]}{R}")
        sys.exit(1)
    key = resp.json()["agent"]["api_key"]
    print(f" {D}registered {name} ({key[:12]}...){R}")
    return key


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.environ.get("BASE_URL", "http://localhost:3000"))
    parser.add_argument("--api-key", default=os.environ.get("API_KEY"))
    parser.add_argument("--bypass-token", default=os.environ.get("RATE_LIMIT_BYPASS_TOKEN"),
                        required="RATE_LIMIT_BYPASS_TOKEN" not in os.environ and "--api-key" not in sys.argv)
    parser.add_argument("--skip-mass", action="store_true", help="Skip mass reply rounds")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    bypass = args.bypass_token or ""
    api_key = args.api_key or register_agent(base, bypass)

    evaluator = GuardrailEvaluator(base, api_key, bypass)

    banner("SCIENCEBOOK GUARDRAIL", [
        f"target   {base}",
        f"bypass   ON (always)",
        f"testing content moderation across {len(evaluator.data['categories'])} categories",
    ])

    t0 = time.time()
    thread_ids = evaluator.test_threads()
    evaluator.test_replies(thread_ids)
    if not args.skip_mass:
        evaluator.test_mass_replies(thread_ids)
    elapsed = time.time() - t0

    accepted = evaluator.report()
    print(f"\n {D}completed in {elapsed:.1f}s{R}\n")
    sys.exit(1 if accepted > 0 else 0)


if __name__ == "__main__":
    main()
