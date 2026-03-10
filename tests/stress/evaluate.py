#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
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

SUITES = [
    "rapid_fire", "concurrent_gets", "concurrent_posts",
    "large_payloads", "slow_requests",
]


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


def sub(text: str):
    print(f"\n  {YLW}{text}{R}")


def pct_bar(value: int, total: int, width: int = 20, color: str = GRN) -> str:
    if total == 0:
        return f"{D}{'░' * width}{R}"
    filled = round(value / total * width)
    return f"{color}{'█' * filled}{'░' * (width - filled)}{R}"


@dataclass
class EndpointResult:
    endpoint: str
    ok: int = 0
    fail: int = 0
    throttled: int = 0
    elapsed: float = 0.0


class StressEvaluator:
    def __init__(self, base_url: str, api_key: str, concurrency: int, rpt: int):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.concurrency = concurrency
        self.rpt = rpt
        self.data = json.loads((Path(__file__).parent / "data.json").read_text())
        self.limits = self.data["rate_limits"]

    def _url(self, p: str) -> str:
        return f"{self.base_url}{p}"

    def _auth(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def _get(self, path: str, timeout: int = 10) -> int:
        try:
            return requests.get(self._url(path), timeout=timeout).status_code
        except requests.exceptions.RequestException:
            return 0

    def _post(self, path: str, payload: dict, timeout: int = 15) -> int:
        try:
            return requests.post(self._url(path), headers=self._auth(), json=payload, timeout=timeout).status_code
        except requests.exceptions.RequestException:
            return 0

    def _post_raw(self, path: str, data: str, timeout: int = 60) -> tuple[int, str]:
        try:
            resp = requests.post(self._url(path), headers=self._auth(), data=data, timeout=timeout)
            return resp.status_code, resp.text
        except requests.exceptions.RequestException as e:
            return 0, str(e)

    def test_rapid_fire(self):
        heading("RAPID-FIRE SEQUENTIAL GETS")
        endpoints = self.data["get_endpoints"]
        n = self.rpt
        print(f"  {D}{n} sequential requests per endpoint, no rate-limit bypass{R}")

        for ep in endpoints:
            res = EndpointResult(endpoint=ep)
            t0 = time.time()
            first_429 = None
            for i in range(1, n + 1):
                code = self._get(ep)
                if code == 200:
                    res.ok += 1
                elif code == 429:
                    res.throttled += 1
                    if first_429 is None:
                        first_429 = i
                else:
                    res.fail += 1
            res.elapsed = time.time() - t0
            rps = n / max(res.elapsed, 0.001)

            bar = pct_bar(res.ok, n, 15, GRN)
            throttle_info = f"  {YLW}429 at req #{first_429}{R}" if first_429 else ""
            fail_info = f"  {RED}{res.fail} err{R}" if res.fail else ""
            print(f"   {bar} {res.ok:>3}/{n} ok  {D}{rps:>5.0f} req/s{R}{throttle_info}{fail_info}  {D}{ep}{R}")

    def test_concurrent_gets(self):
        heading("CONCURRENT GETS")
        ep = "/api/problems"
        n = self.rpt
        c = self.concurrency
        print(f"  {D}{n} requests, {c} parallel workers to {ep}{R}")

        codes: list[int] = []
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=c) as pool:
            futures = [pool.submit(self._get, ep) for _ in range(n)]
            for f in as_completed(futures):
                codes.append(f.result())
        elapsed = time.time() - t0
        rps = n / max(elapsed, 0.001)

        c200 = codes.count(200)
        c429 = codes.count(429)
        c5xx = sum(1 for c_ in codes if 500 <= c_ < 600)
        other = n - c200 - c429 - c5xx

        print(f"   {GRN}200{R}: {c200:<6} {YLW}429{R}: {c429:<6} {RED}5xx{R}: {c5xx:<6} {D}other{R}: {other}")
        print(f"   {D}{elapsed:.1f}s total, ~{rps:.0f} req/s{R}")
        print(f"   {pct_bar(c200, n, 30, GRN)} {c200}/{n} success")

    def test_concurrent_posts(self):
        heading("CONCURRENT POSTS")
        n = min(self.rpt, 50)
        c = self.concurrency
        lim = self.limits["solutions"]
        print(f"  {D}{n} concurrent solution submissions (limit: {lim['max']}/{lim['window_s']}s){R}")

        def do_post(i: int) -> int:
            pid = (i % 4) + 1
            return self._post("/api/solutions", {"problem_id": pid, "solution": {"values": [0.5] * 4}})

        codes: list[int] = []
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=c) as pool:
            futures = [pool.submit(do_post, i) for i in range(n)]
            for f in as_completed(futures):
                codes.append(f.result())
        elapsed = time.time() - t0

        c2xx = sum(1 for c_ in codes if 200 <= c_ < 300)
        c429 = codes.count(429)
        c4xx = sum(1 for c_ in codes if 400 <= c_ < 500 and c_ != 429)
        c5xx = sum(1 for c_ in codes if 500 <= c_ < 600)

        print(f"   {GRN}2xx{R}: {c2xx:<6} {YLW}429{R}: {c429:<6} {RED}4xx{R}: {c4xx:<6} {RED}5xx{R}: {c5xx}")
        print(f"   {D}{elapsed:.1f}s total{R}")

        if c429 > 0:
            pct = c429 * 100 // n
            print(f"   {GRN}✓{R} rate limiter engaged: {c429}/{n} requests throttled ({pct}%)")
        elif c2xx == n:
            print(f"   {YLW}⚠{R} no rate limiting observed — all {n} accepted")

    def test_large_payloads(self):
        heading("LARGE PAYLOAD LIMITS")
        cfg = self.data["large_payload"]
        sizes = cfg["sizes"]
        prob = cfg["problem"]
        pid, field_name, fill = prob["id"], prob["field"], prob["fill"]
        print(f"  {D}testing problem {pid}, field {field_name} (rate limit applies){R}")

        for size in sizes:
            payload = json.dumps({"problem_id": pid, "solution": {field_name: [fill] * size}})
            kb = len(payload) / 1024

            print(f"   {D}size {size:>9,} ({kb:>8.1f} KB){R} ", end="", flush=True)
            code, body = self._post_raw("/api/solutions", payload)

            if code == 429:
                print(f"{YLW}429 rate limited{R}")
                print(f"   {D}hit rate limit — remaining sizes skipped{R}")
                break
            elif code == 413:
                print(f"{RED}413 too large{R}")
                break
            elif code >= 500:
                print(f"{RED}{code} server error{R}")
                break
            elif 200 <= code < 300:
                print(f"{GRN}{code} accepted{R}")
            else:
                print(f"{YLW}{code}{R}  {D}{body[:100]}{R}")

    def test_slow_requests(self):
        heading("SLOW / OVERSIZED REQUESTS")

        sub("Normal POST timing")
        t0 = time.time()
        try:
            resp = requests.post(
                self._url("/api/solutions"), headers=self._auth(),
                json={"problem_id": 1, "solution": {"values": [0.5, 0.5, 0.5]}},
                timeout=30,
            )
            elapsed = time.time() - t0
            print(f"   {D}{resp.status_code} in {elapsed:.2f}s{R}")
        except requests.exceptions.RequestException as e:
            print(f"   {RED}failed: {e}{R}")

        sub("Long query params")
        for label, size in [("10 KB", 10000), ("100 KB", 100000)]:
            try:
                code = self._get(f"/api/problems?garbage={'A' * size}")
                color = GRN if code == 200 else YLW if code == 414 else RED
                print(f"   {D}{label:>6}{R}  {color}{code}{R}")
            except Exception:
                print(f"   {D}{label:>6}{R}  {RED}connection failed{R}")


def register_agent(base_url: str, bypass_token: str | None) -> str:
    name = f"StressBot_{int(time.time())}"
    headers = {"Content-Type": "application/json"}
    if bypass_token:
        headers["X-RateLimit-Bypass"] = bypass_token
    resp = requests.post(
        f"{base_url}/api/agents/register",
        headers=headers,
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
                        help="Only used for agent registration, never for actual tests")
    parser.add_argument("--concurrency", type=int, default=None)
    parser.add_argument("--requests", type=int, default=None)
    parser.add_argument("--suite", choices=SUITES, action="append")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    api_key = args.api_key or register_agent(base, args.bypass_token)

    data = json.loads((Path(__file__).parent / "data.json").read_text())
    concurrency = args.concurrency or data["config"]["concurrency"]
    rpt = args.requests or data["config"]["requests_per_test"]

    evaluator = StressEvaluator(base, api_key, concurrency, rpt)
    suites = args.suite or SUITES

    banner("SCIENCEBOOK STRESS", [
        f"target       {base}",
        f"bypass       OFF (never — testing real rate limits)",
        f"concurrency  {concurrency}",
        f"requests     {rpt} per test",
        f"suites       {', '.join(suites)}",
    ])

    suite_map = {s: getattr(evaluator, f"test_{s}") for s in SUITES}
    t0 = time.time()
    for s in suites:
        suite_map[s]()
    elapsed = time.time() - t0

    print(f"\n {D}{'─' * 56}{R}")
    print(f" {D}completed in {elapsed:.1f}s{R}\n")


if __name__ == "__main__":
    main()
