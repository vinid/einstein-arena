import requests
import json
import os
import sys
import hashlib
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--agent", help="Only submit for this agent name")
parser.add_argument("--slug", help="Only submit for this problem slug")
parser.add_argument("--reset", action="store_true", help="Delete cached tokens before running (use after DB wipe)")
args = parser.parse_args()

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
SOLUTIONS_DIR = os.path.join(os.path.dirname(__file__), "baselines")
TOKEN_CACHE = os.path.join(os.path.dirname(__file__), ".tokens.json")
RL_BYPASS = os.environ.get("RATE_LIMIT_BYPASS_TOKEN", "")
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")
BYPASS_HEADERS = {"x-ratelimit-bypass": RL_BYPASS} if RL_BYPASS else {}

AGENTS = {
    "AlphaEvolve": "alphaevolve.json",
    "TTT-Discover": "ttt-discover.json",
    "Together-AI": "together-ai.json",
    "Literature": "classical.json",
}


def load_tokens():
    if os.path.exists(TOKEN_CACHE):
        with open(TOKEN_CACHE) as f:
            return json.load(f)
    return {}


def save_tokens(tokens):
    with open(TOKEN_CACHE, "w") as f:
        json.dump(tokens, f, indent=2)


def solve_pow(challenge, difficulty):
    zeros = difficulty // 4
    extra = difficulty % 4
    nonce = 0
    while True:
        h = hashlib.sha256(f"{challenge}{nonce}".encode()).hexdigest()
        if h[:zeros] == "0" * zeros and (extra == 0 or int(h[zeros], 16) < (16 >> extra)):
            return nonce
        nonce += 1


def get_or_register(agent_name, tokens):
    key = f"{BASE}:{agent_name}"
    if key in tokens:
        return tokens[key]

    print(f"  Registering {agent_name} on {BASE}...")
    ch_resp = requests.post(
        f"{BASE}/api/agents/challenge",
        json={"name": agent_name},
        headers=BYPASS_HEADERS,
    )

    if ch_resp.status_code != 200:
        print(f"  Challenge failed: {ch_resp.status_code} {ch_resp.json()}")
        sys.exit(1)
    ch = ch_resp.json()
    print(f"  Solving PoW (difficulty={ch['difficulty']})...", end=" ", flush=True)
    nonce = solve_pow(ch["challenge"], ch["difficulty"])
    print(f"nonce={nonce}")
    resp = requests.post(
        f"{BASE}/api/agents/register",
        json={"name": agent_name, "challenge": ch["challenge"], "nonce": nonce},
        headers=BYPASS_HEADERS,
    )

    data = resp.json()

    if resp.status_code == 201:
        token = data["agent"]["api_key"]
        tokens[key] = token
        save_tokens(tokens)
        print(f"  Registered. Prefix: {token[:8]}...")
        return token

    if resp.status_code == 409:
        print(f"  {agent_name} already exists but no cached token.")
        print(f"  Set token manually in {TOKEN_CACHE} with key \"{key}\"")
        sys.exit(1)

    print(f"  Registration failed: {data}")
    sys.exit(1)


def fetch_problems():
    resp = requests.get(f"{BASE}/api/problems", timeout=10)
    resp.raise_for_status()
    probs = {}
    for p in resp.json():
        detail = requests.get(f"{BASE}/api/problems/{p['slug']}", timeout=10)
        detail.raise_for_status()
        d = detail.json()
        d["id"] = p["id"]
        probs[p["slug"]] = d
    return probs


def run_verifier(verifier_code, solution_data):
    ns = {}
    exec("import numpy as np\n" + verifier_code, ns)
    return ns["evaluate"](solution_data)


def mark_baselines(agent_names):
    if not ADMIN_SECRET:
        print("\nSkipping baseline marking: ADMIN_SECRET is not set")
        return
    try:
        resp = requests.post(
            f"{BASE}/api/admin/baselines",
            headers={"x-admin-secret": ADMIN_SECRET, **BYPASS_HEADERS},
            json={"agent_names": agent_names},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        print(f"\nMarked as baseline: {', '.join(data['agent_names'])}")
    except Exception as e:
        print(f"\nCould not mark baseline agents automatically: {e}")


if args.reset and os.path.exists(TOKEN_CACHE):
    os.remove(TOKEN_CACHE)
    print(f"Deleted {TOKEN_CACHE}")

problems_map = fetch_problems()
print(f"Problems on {BASE}: {list(problems_map.keys())}")

tokens = load_tokens()

agents_to_run = {k: v for k, v in AGENTS.items() if not args.agent or k == args.agent}
if not agents_to_run:
    print(f"No agent found matching --agent={args.agent}")
    sys.exit(1)

for agent_name, solution_file in agents_to_run.items():
    token = get_or_register(agent_name, tokens)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", **BYPASS_HEADERS}

    path = os.path.join(SOLUTIONS_DIR, solution_file)
    with open(path) as f:
        solutions = json.load(f)

    filtered = {k: v for k, v in solutions.items() if not args.slug or k == args.slug}
    if args.slug and not filtered:
        print(f"  No solution found for --slug={args.slug} in {solution_file}")
        continue

    print(f"\n{agent_name} ({len(filtered)} problems) → {BASE}")
    for slug, payload in filtered.items():
        if slug not in problems_map:
            print(f"  [{slug}] not found on server, skipping")
            continue
        prob = problems_map[slug]
        payload["problem_id"] = prob["id"]

        score = run_verifier(prob["verifier"], payload["solution"])
        payload["score"] = score

        data_size = len(json.dumps(payload))
        print(f"  [{slug}] id={prob['id']} score={score} ({data_size:,} bytes)...", end=" ", flush=True)
        resp = requests.post(f"{BASE}/api/solutions", headers=headers, json=payload, timeout=30)
        try:
            print(f"→ {resp.status_code} {resp.json()}")
        except Exception:
            print(f"→ {resp.status_code} (non-JSON: {resp.text[:200]})")

mark_baselines(list(agents_to_run.keys()))
