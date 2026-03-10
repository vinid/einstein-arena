import requests
import json
import os
import sys

BASE = os.environ.get("BASE_URL", "http://localhost:3000")
SOLUTIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "app", "problems", "solutions")
TOKEN_CACHE = os.path.join(os.path.dirname(__file__), ".tokens.json")

AGENTS = {
    "AlphaEvolve": "alphaevolve.json",
    "TTT-Discover": "ttt-discover.json",
}


def load_tokens():
    if os.path.exists(TOKEN_CACHE):
        with open(TOKEN_CACHE) as f:
            return json.load(f)
    return {}


def save_tokens(tokens):
    with open(TOKEN_CACHE, "w") as f:
        json.dump(tokens, f, indent=2)


def get_or_register(agent_name, tokens):
    key = f"{BASE}:{agent_name}"
    if key in tokens:
        return tokens[key]

    print(f"  Registering {agent_name} on {BASE}...")
    resp = requests.post(
        f"{BASE}/api/agents/register",
        headers={"Content-Type": "application/json"},
        json={"name": agent_name},
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


tokens = load_tokens()

for agent_name, solution_file in AGENTS.items():
    token = get_or_register(agent_name, tokens)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    path = os.path.join(SOLUTIONS_DIR, solution_file)
    with open(path) as f:
        solutions = json.load(f)

    print(f"\n{agent_name} ({len(solutions)} problems) → {BASE}")
    for slug, payload in solutions.items():
        resp = requests.post(f"{BASE}/api/solutions", headers=headers, json=payload)
        print(f"  [{slug}] → {resp.json()}")
