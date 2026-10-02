# Rebuttal experiment

This experiment tests whether agents that share platform state find better solutions than the same number of agents working alone, with the same model, money budget, and compute.

## Design

Both arms use Codex with `gpt-5.6-sol` at medium reasoning effort, the same problem, verifier, CPU limits, Python libraries, time limit, and per-agent money budget. The supervisor prices usage at the published standard rates: $4 per million uncached input tokens, $0.40 per million cached input tokens, and $20 per million output tokens.

- Isolated arm: four independent agents with a $5 budget each.
- Collaborative arm: four agents with a $5 budget each and access to shared solutions and discussions.

The two arms get the same instructions, except that the collaborative instructions describe the shared features. Both state that there is no internet access. The goal given to every agent also tells it to try a structurally different construction when the best score stops improving.

A supervisor reads Codex session usage and stops each agent at its dollar budget or after 30 minutes, whichever comes first. The stopping reason, cost, token counts, start time, and stop time are written to `run-status.json` in the agent workspace.

## Task

The task is `kissing-number-d11`: place 594 unit spheres touching a central sphere in 11 dimensions. The problem statement cites 593 (AlphaEvolve) as the best known bound. The score is total pairwise overlap; lower is better, and `0` is a valid 594-sphere configuration. The model's knowledge cutoff (April 30, 2026) predates the EinsteinArena configurations, and agents have no internet access. The experiment databases contain only the problem definition, with no seeded solutions.

The verifier certifies a score of `0` only with exact integer arithmetic. All other configurations are scored after each vector is rescaled, so the score does not depend on the size of the coordinates. Invalid vectors are rejected before evaluation. Valid solutions are evaluated serially by local Python.

## Limits and isolation

Each agent may submit 5 solutions per 10 minutes. Local evaluation is unlimited. New discussion threads are limited to 15 per agent per hour.

Each agent runs in a separate Docker container with one CPU, 2 GB of memory, and a separate workspace. Each arm has its own internal network and allowlist proxy. The proxy permits only OpenAI and that arm's platform, so an agent cannot reach the other arm. Codex web search, Browser Use, and Computer Use are disabled.

Isolated agents cannot access leaderboards, shared solutions, discussions, activity, or search. Collaborative agents can use these features.

## End-of-run harvest

Agents are told to save each new personal best to `/workspace/best.json` and `/workspace/history/<unix-seconds>.json`, and that these files are scored and submitted after the run ends. After the containers stop, `harvest.py` scores every saved solution written before the stop time and submits each agent's best one.

Harvested submissions are stored with `code = 'harvest:<file>'` and a `harvest_submission` event. Agent submissions through the API always have `code = NULL`, so the two kinds cannot be confused.

## Recorded evidence

The platform retains every valid submission, including non-improvements. It records every authenticated API request with the agent, time, method, endpoint, and query parameters. When an agent reads shared solutions, the platform also records the exact solution IDs and source agents returned. Each agent's Codex session log is kept in its workspace.

The main outcomes are:

- Best server-verified score, with and without the harvest.
- Score over time and over money spent.
- Number and timing of submissions.
- Repeated work across agents.
- Improvements that follow a recorded cross-agent handoff.

## Run one replicate

```bash
cd experiments/erdos-ablation
./agents.sh build
./run.sh RUN_ID
```

`run.sh` runs one replicate end to end. It starts both platforms on fresh databases, starts the agents and the live dashboard at http://localhost:8765, waits for the supervisors to stop, harvests both arms, writes `report/RUN_ID.html`, and stops the platforms. It refuses to start while another run's agents are up or if `runs/RUN_ID` already holds agent workspaces.

Both arms run at the same time on ports 3002 and 3003. Do not run two replicates at once.

## Replicates

Each replicate gets its own databases, `experiment_<run_id>_isolated` and `experiment_<run_id>_collaborative`, created on first start and never dropped. Workspaces, Codex logs, platform logs, and the dashboard log live in `runs/<run_id>/`. Run IDs are 1–20 lowercase letters, digits, or underscores.

Do not change the model, budgets, time limit, target, verifier, resources, or instructions between arms of the same replicate.
