"""Results for one task over all its runs: best agent per arm per run. Every run of the task counts.

Primary: the per-run difference (collaborative best minus isolated best), with a bootstrap 95% CI over runs (BCa) and a
one-sided paired sign-flip permutation test on its mean. Robustness: wins, t-intervals, one-sided paired Wilcoxon and
Mann-Whitney.

  python analyze.py <task>

An agent's score is its best server-verified score, including the harvested best it saved but did not submit. Also checks
that collaborative posters never read the platform, and writes results/<task>.txt with every agent's score.
"""
import sys
from pathlib import Path

import numpy as np
import psycopg2
from scipy import stats

ROOT = Path(__file__).resolve().parent
DB = "postgresql://sciencebook:sciencebook@localhost:55432/experiment_{}_{}"
READS = ("/api/leaderboard", "/api/solutions/best", "/api/activity", "/api/search", "/api/agents/me/activity", "/api/threads/")


def query(run: str, arm: str, sql: str) -> list[tuple]:
    with psycopg2.connect(DB.format(run, arm)) as conn, conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def ci(x: np.ndarray) -> float:
    return stats.t.ppf(0.975, len(x) - 1) * x.std(ddof=1) / len(x) ** 0.5


task = sys.argv[1]
readers = set()
for line in (ROOT / "config.env").read_text().splitlines():
    if line.startswith("EXPERIMENT_PLATFORM_SLOTS="):
        readers = {f"{int(n):02d}" for n in line.split("=", 1)[1].strip('"').split()}
# check.sh preflights (chk*) are not runs.
runs = sorted(p.parent.name for p in (ROOT / "runs").glob("*/task")
              if p.read_text().strip() == task and not p.parent.name.startswith("chk"))
if not runs:
    raise SystemExit(f"No runs of {task}")

lines, best, poster_reads = [], {}, {}
for run in runs:
    for arm in ("isolated", "collaborative"):
        scores = dict(query(run, arm, """select agent_name, max(score) from solutions
            where status in ('evaluated', 'rejected') group by agent_name"""))
        agents = [f"agent-{n:02d}" for n in range(1, 5)]
        lines.append(f"{run} {arm} " + " ".join(f"{scores.get(a, 0):g}" for a in agents))
        best.setdefault(run, {})[arm] = max(scores.get(a, 0) for a in agents)
    for agent, path, n in query(run, "collaborative", "select agent_name, endpoint, count(*) from agent_events where event_type = 'api_request' and metadata->>'method' = 'GET' group by 1, 2"):
        if agent.rsplit("-", 1)[1] not in readers and (path.startswith(READS) or path.endswith("/threads")):
            poster_reads[(run, agent)] = poster_reads.get((run, agent), 0) + n

(ROOT / "results").mkdir(exist_ok=True)
(ROOT / "results" / f"{task}.txt").write_text("\n".join(lines) + "\n")

iso = np.array([best[r]["isolated"] for r in runs])
col = np.array([best[r]["collaborative"] for r in runs])
diff = col - iso
print(f"{task}: {len(runs)} runs ({runs[0]}..{runs[-1]})")
print(f"collaborative wins {(diff > 0).sum()}, isolated wins {(diff < 0).sum()}, ties {(diff == 0).sum()}")
if len(runs) > 1:
    print(f"isolated best      {iso.mean():.1f} ± {ci(iso):.1f}")
    print(f"collaborative best {col.mean():.1f} ± {ci(col):.1f}")
    print(f"difference         {diff.mean():+.1f} ± {ci(diff):.1f}")
    if np.any(diff != diff[0]):
        boot = stats.bootstrap((diff,), np.mean, n_resamples=10_000, method="BCa", random_state=0).confidence_interval
        print(f"difference, bootstrap 95% CI [{boot.low:+.1f}, {boot.high:+.1f}]")
    flip = stats.permutation_test((diff,), np.mean, permutation_type="samples", alternative="greater",
                                  n_resamples=100_000, random_state=0)
    # With 2^runs > n_resamples the p-value is estimated, and its smallest possible value is 1 / (n_resamples + 1).
    print(f"sign-flip permutation (paired, one-sided) p = {flip.pvalue:.2g}" + (" (smallest possible)" if flip.pvalue <= 1 / 100_001 else ""))
    if np.any(diff != 0):
        print(f"Wilcoxon (paired, one-sided) p = {stats.wilcoxon(col, iso, alternative='greater').pvalue:.2g}")
    print(f"Mann-Whitney (one-sided)     p = {stats.mannwhitneyu(col, iso, alternative='greater').pvalue:.2g}")
print("posters that read the platform: " + (", ".join(f"{r}/{a} ({n} reads)" for (r, a), n in poster_reads.items()) or "none"))
