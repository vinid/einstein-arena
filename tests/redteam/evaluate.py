#!/usr/bin/env python3
import argparse
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass
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
    "auth_bypass", "injection", "xss", "malformed_input",
    "idor", "registration", "prototype_pollution", "ssrf",
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


@dataclass
class Hit:
    suite: str
    name: str
    code: int
    passed: bool | None
    warning: str = ""


class RedTeam:
    def __init__(self, base_url: str, api_key: str, bypass_token: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.s = requests.Session()
        self.s.headers["X-RateLimit-Bypass"] = bypass_token
        self.hits: list[Hit] = []
        self.data = json.loads((Path(__file__).parent / "data.json").read_text())

    def _url(self, p: str) -> str:
        return f"{self.base_url}{p}"

    def _auth(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def _req(self, method: str, path: str, headers: dict | None = None,
             json_body=None, raw_body: str | None = None, timeout: int = 10) -> tuple[int, str]:
        url = self._url(path)
        h = headers or {}
        try:
            if raw_body is not None:
                resp = self.s.request(method, url, headers=h, data=raw_body, timeout=timeout)
            elif json_body is not None:
                h.setdefault("Content-Type", "application/json")
                resp = self.s.request(method, url, headers=h, json=json_body, timeout=timeout)
            else:
                resp = self.s.request(method, url, headers=h, timeout=timeout)
            return resp.status_code, resp.text
        except requests.exceptions.RequestException as e:
            return 0, str(e)

    def _log(self, suite: str, name: str, code: int, passed: bool | None, warning: str = ""):
        self.hits.append(Hit(suite, name, code, passed, warning))
        sym = f"{GRN}✓{R}" if passed is True else f"{RED}✗{R}" if passed is False else f"{D}·{R}"
        code_c = f"{GRN}{code}{R}" if passed is True else f"{RED}{code}{R}" if passed is False else f"{D}{code}{R}"
        print(f"   {sym} {name:<44} {code_c}")
        if warning:
            print(f"     {YLW}⚠ {warning}{R}")

    def _resolve(self, h: dict) -> dict:
        return {k: v.replace("{api_key}", self.api_key) if isinstance(v, str) else v for k, v in h.items()}

    def test_auth_bypass(self):
        heading("AUTH BYPASS")
        d = self.data["auth_bypass"]
        must_reject = set(d["must_reject"])
        for ep in d["endpoints"]:
            sub(f"{ep['method']} {ep['path']}")
            for v in d["variants"]:
                h = self._resolve(v["headers"])
                h["Content-Type"] = "application/json"
                code, _ = self._req(ep["method"], ep["path"], headers=h, json_body=ep["payload"])
                passed = code in (401, 403) if v["name"] in must_reject else None
                self._log("auth_bypass", v["name"], code, passed)

    def test_injection(self):
        heading("INJECTION")
        d = self.data["injection"]
        leak_re = re.compile("|".join(d["sql_leak_patterns"]), re.IGNORECASE)
        cmd_re = re.compile("|".join(d["cmd_leak_patterns"]), re.IGNORECASE)

        sub("SQL injection in URL slugs")
        for slug in d["sql_slugs"]:
            code, body = self._req("GET", f"/api/problems/{slug}")
            w = "SQL error leak in response" if leak_re.search(body) else ""
            self._log("injection", f"sqli_slug {slug[:35]}", code, code in (400, 404), w)

        sub("SQL injection in query params")
        for param in d["sql_params"]:
            code, body = self._req("GET", f"/api/leaderboard?{param}")
            w = "SQL error leak in response" if leak_re.search(body) else ""
            self._log("injection", f"sqli_param {param[:34]}", code, None, w)

        sub("NoSQL injection in POST body")
        for payload in d["nosql_payloads"]:
            code, _ = self._req("POST", "/api/solutions", headers=self._auth(), json_body=payload)
            self._log("injection", f"nosqli {json.dumps(payload)[:37]}", code, code in (400, 422))

        sub("Command injection in thread content")
        for payload in d["command_injection"]:
            code, body = self._req("POST", "/api/problems/erdos-min-overlap/threads", headers=self._auth(), json_body=payload)
            w = "CRITICAL: command injection worked" if cmd_re.search(body) else ""
            self._log("injection", f"cmdi {payload['body'][:39]}", code, None, w)

    def test_xss(self):
        heading("XSS & CONTENT INJECTION")
        d = self.data["xss"]

        sub("XSS in thread title/body")
        for p in d["thread_payloads"]:
            code, body = self._req("POST", "/api/problems/erdos-min-overlap/threads", headers=self._auth(), json_body=p)
            w = "script tag reflected in response" if "<script>" in body else ""
            self._log("xss", f"thread {p['body'][:38]}", code, None, w)

        sub("XSS in agent registration")
        for p in d["registration_payloads"]:
            code, _ = self._req("POST", "/api/agents/register", headers={"Content-Type": "application/json"}, json_body=p)
            self._log("xss", f"register {p['name'][:35]}", code, None)

    def test_malformed_input(self):
        heading("MALFORMED INPUT")
        d = self.data["malformed_input"]

        sub("Invalid JSON bodies")
        for raw in d["invalid_json_strings"]:
            code, _ = self._req("POST", "/api/solutions", headers=dict(self._auth()), raw_body=raw)
            self._log("malformed_input", f"json {raw[:39]}", code, code in (400, 422))

        sub("Wrong Content-Type headers")
        body = '{"problem_id": 1, "solution": {"h_values": [0.5]}}'
        for ct in d["wrong_content_types"]:
            h = {"Authorization": f"Bearer {self.api_key}"}
            if ct is not None:
                h["Content-Type"] = ct
            code, _ = self._req("POST", "/api/solutions", headers=h, raw_body=body)
            self._log("malformed_input", f"content-type {ct or 'none'}", code, None)

        sub("Wrong types for fields")
        for e in d["wrong_type_payloads"]:
            code, _ = self._req("POST", "/api/solutions", headers=self._auth(), json_body=e["payload"])
            self._log("malformed_input", f"type {e['label']}", code, code in (400, 422))

        sub("Raw edge case payloads")
        for e in d["raw_edge_payloads"]:
            code, _ = self._req("POST", "/api/solutions", headers=dict(self._auth()), raw_body=e["raw"])
            self._log("malformed_input", f"raw {e['label']}", code, None)

        sub("Wrong HTTP methods")
        for method in d["http_methods"]:
            for ep in d["method_endpoints"]:
                code, _ = self._req(method, ep, headers={"Authorization": f"Bearer {self.api_key}"})
                self._log("malformed_input", f"{method} {ep}", code, None)

    def test_idor(self):
        heading("IDOR & ACCESS CONTROL")
        d = self.data["idor"]
        sens_re = re.compile("|".join(d["sensitive_patterns"]), re.IGNORECASE)

        sub("Enumerating solution IDs")
        for sid in d["solution_ids"]:
            code, body = self._req("GET", f"/api/solutions/{sid}")
            w = f"sensitive data exposed in solution {sid}" if code == 200 and sens_re.search(body) else ""
            self._log("idor", f"solution/{sid}", code, None, w)

        sub("Enumerating thread IDs")
        for tid in d["thread_ids"]:
            code, _ = self._req("GET", f"/api/threads/{tid}")
            self._log("idor", f"thread/{tid}", code, None)

        sub("Path traversal in slugs")
        for slug in d["traversal_slugs"]:
            code, _ = self._req("GET", f"/api/problems/{slug}")
            w = "path traversal returned 200" if code == 200 else ""
            self._log("idor", f"traversal {slug}", code, code in (400, 404, 308, 500), w)

        sub("Probing hidden endpoints")
        for path in d["hidden_paths"]:
            code, _ = self._req("GET", path, headers={"Authorization": f"Bearer {self.api_key}"})
            w = f"endpoint found: {path}" if code in (200, 301, 302) else ""
            self._log("idor", f"hidden {path}", code, None, w)

    def test_registration(self):
        heading("REGISTRATION ABUSE")
        d = self.data["registration"]

        sub("Duplicate agent names")
        dup = f"DuplicateTest_{int(time.time())}"
        code1, _ = self._req("POST", "/api/agents/register", headers={"Content-Type": "application/json"},
                             json_body={"name": dup, "description": "first"})
        code2, _ = self._req("POST", "/api/agents/register", headers={"Content-Type": "application/json"},
                             json_body={"name": dup, "description": "second"})
        self._log("registration", f"first registration", code1, None)
        self._log("registration", f"duplicate attempt", code2, code2 == 409)

        sub("Unusual agent names")
        for name in d["weird_names"]:
            code, _ = self._req("POST", "/api/agents/register", headers={"Content-Type": "application/json"},
                                json_body={"name": name, "description": "redteam test"})
            self._log("registration", f"name {name[:38]}", code, None)

        sub("Missing/extra fields")
        for p in d["field_payloads"]:
            code, _ = self._req("POST", "/api/agents/register", headers={"Content-Type": "application/json"}, json_body=p)
            self._log("registration", f"fields {json.dumps(p)[:37]}", code, None)

        sub(f"Mass registration ({d['mass_count']} agents)")
        for i in range(1, d["mass_count"] + 1):
            code, _ = self._req("POST", "/api/agents/register", headers={"Content-Type": "application/json"},
                                json_body={"name": f"MassReg_{random.randint(10000, 99999)}", "description": f"mass {i}"})
            self._log("registration", f"mass agent {i}", code, None)

    def test_prototype_pollution(self):
        heading("PROTOTYPE POLLUTION & JSON EDGE CASES")
        d = self.data["prototype_pollution"]

        sub("Proto pollution in solution body")
        for p in d["solution_payloads"]:
            code, _ = self._req("POST", "/api/solutions", headers=self._auth(), json_body=p)
            self._log("prototype_pollution", f"proto {json.dumps(p)[:38]}", code, None)

        sub("Proto pollution in registration")
        for p in d["registration_payloads"]:
            code, _ = self._req("POST", "/api/agents/register", headers={"Content-Type": "application/json"}, json_body=p)
            self._log("prototype_pollution", f"reg {json.dumps(p)[:40]}", code, None)

        sub("JSON edge cases")
        for p in d["json_edge_cases"]:
            code, _ = self._req("POST", "/api/solutions", headers=self._auth(), json_body=p)
            self._log("prototype_pollution", f"edge {json.dumps(p)[:38]}", code, None)

        sub("Duplicate key payloads")
        for raw in d["duplicate_key_raw"]:
            code, _ = self._req("POST", "/api/solutions", headers=dict(self._auth()), raw_body=raw)
            self._log("prototype_pollution", f"dup {raw[:40]}", code, None)

    def test_ssrf(self):
        heading("SSRF & HEADER MANIPULATION")
        d = self.data["ssrf"]

        sub("Header injection / smuggling")
        for t in d["header_tests"]:
            code, _ = self._req("GET", "/api/problems", headers={t["header"]: t["value"]})
            self._log("ssrf", f"header {t['header']}={t['value']}", code, None)

        sub("CORS probing")
        for origin in d["cors_origins"]:
            try:
                resp = self.s.get(self._url("/api/problems"), headers={"Origin": origin}, timeout=10)
                acao = resp.headers.get("Access-Control-Allow-Origin", "(none)")  # noqa
                w = f"ACAO={acao}" if acao != "(none)" else ""
                self._log("ssrf", f"cors {origin}", resp.status_code, None, w)
            except requests.exceptions.RequestException:
                self._log("ssrf", f"cors {origin}", 0, None)

        sub("SSRF via solution data")
        for p in d["payloads"]:
            code, _ = self._req("POST", "/api/solutions", headers=self._auth(), json_body=p)
            self._log("ssrf", f"ssrf {json.dumps(p)[:38]}", code, None)

    def report(self):
        heading("SUMMARY")
        by_suite: dict[str, list[Hit]] = {}
        for h in self.hits:
            by_suite.setdefault(h.suite, []).append(h)

        tp = tf = tw = ti = 0
        for suite in SUITES:
            hits = by_suite.get(suite, [])
            if not hits:
                continue
            p = sum(1 for h in hits if h.passed is True)
            f = sum(1 for h in hits if h.passed is False)
            w = sum(1 for h in hits if h.warning)
            i = sum(1 for h in hits if h.passed is None)
            tp += p; tf += f; tw += w; ti += i

            parts = []
            if p: parts.append(f"{GRN}✓ {p} pass{R}")
            if f: parts.append(f"{RED}✗ {f} fail{R}")
            if w: parts.append(f"{YLW}⚠ {w} warn{R}")
            if i: parts.append(f"{D}{i} info{R}")
            print(f"   {suite:<24} {len(hits):>3} tests   {'  '.join(parts)}")

        total = len(self.hits)
        print(f" {D}{'─' * 56}{R}")
        print(f"   {B}{'TOTAL':<24} {total:>3} tests{R}   {GRN}✓ {tp}{R}  {RED}✗ {tf}{R}  {YLW}⚠ {tw}{R}  {D}{ti} info{R}")

        warnings = [h for h in self.hits if h.warning]
        if warnings:
            print(f"\n   {YLW}{B}WARNINGS:{R}")
            for h in warnings:
                print(f"   {YLW}⚠{R} [{D}{h.suite}{R}] {h.name}: {YLW}{h.warning}{R}")

        return tf, tw


def register_agent(base_url: str, bypass_token: str) -> str:
    name = f"RedTeamBot_{int(time.time())}"
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
    parser.add_argument("--suite", choices=SUITES, action="append")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    bypass = args.bypass_token or ""
    api_key = args.api_key or register_agent(base, bypass)

    runner = RedTeam(base, api_key, bypass)
    suites = args.suite or SUITES

    banner("SCIENCEBOOK RED TEAM", [
        f"target   {base}",
        f"bypass   {'ON' if bypass else 'OFF'}",
        f"suites   {', '.join(suites)}",
    ])

    suite_map = {s: getattr(runner, f"test_{s}") for s in SUITES}
    t0 = time.time()
    for s in suites:
        suite_map[s]()
    elapsed = time.time() - t0

    fails, warns = runner.report()
    print(f"\n {D}completed in {elapsed:.1f}s{R}\n")
    sys.exit(1 if fails > 0 or warns > 0 else 0)


if __name__ == "__main__":
    main()
