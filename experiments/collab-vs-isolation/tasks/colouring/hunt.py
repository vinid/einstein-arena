"""How this task was built: the graph, the target and the seeds. Not used by the runs.

  python hunt.py graph            check that EDGES in verifier.py is regular_graph(300, 6, seed=1)
  python hunt.py <workers> <secs> target search: independent perturb-and-repair tabu workers, merged by the verifier;
                                  writes target-solution.json and seeds/

The target in task.env (168) is the score of target-solution.json from `python hunt.py 12 1200` (12 cores, 20 minutes):
12 workers found 996 good colourings, of which 168 differ pairwise on at least 30 vertices.
"""
import itertools
import json
import random
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

import verifier

HERE = Path(__file__).resolve().parent
N, T, D = verifier.VERTICES, verifier.MAX_CONFLICTS, verifier.MIN_DIFFERENCE
ADJ = [[] for _ in range(N)]
for a, b in verifier.EDGES:
    ADJ[a].append(b)
    ADJ[b].append(a)
PERMUTATIONS = list(itertools.permutations(range(3)))


def regular_graph(n: int, d: int, seed: int) -> list[tuple[int, int]]:
    """Configuration model, retried until the graph has no loops or repeated edges."""
    rng = random.Random(seed)
    while True:
        stubs = [v for v in range(n) for _ in range(d)]
        rng.shuffle(stubs)
        edges = {(min(a, b), max(a, b)) for a, b in zip(stubs[::2], stubs[1::2]) if a != b}
        if len(edges) == n * d // 2:
            return sorted(edges)


def tabu(c: list[int], rng: random.Random, max_iter: int) -> tuple[list[int], int]:
    """Tabucol from colouring c until at most T conflicts or max_iter moves; returns the best colouring seen."""
    c = list(c)
    gamma = [[0, 0, 0] for _ in range(N)]
    for v in range(N):
        for u in ADJ[v]:
            gamma[v][c[u]] += 1
    conf = sum(gamma[v][c[v]] for v in range(N)) // 2
    tabu_until, best, best_c, it = {}, conf, list(c), 0
    while best > T and it < max_iter:
        it += 1
        best_delta, moves = None, []
        for v in range(N):
            g, cv = gamma[v], c[v]
            if g[cv] == 0:
                continue
            for k in range(3):
                if k == cv:
                    continue
                delta = g[k] - g[cv]
                if tabu_until.get((v, k), 0) > it and conf + delta >= best:
                    continue
                if best_delta is None or delta < best_delta:
                    best_delta, moves = delta, [(v, k)]
                elif delta == best_delta:
                    moves.append((v, k))
        if not moves:
            continue
        v, k = rng.choice(moves)
        old, c[v] = c[v], k
        for u in ADJ[v]:
            gamma[u][old] -= 1
            gamma[u][k] += 1
        conf += best_delta
        tabu_until[(v, old)] = it + 7 + rng.randrange(10)
        if conf < best:
            best, best_c = conf, list(c)
    return best_c, best


def far_from_all(c: list[int], kept: list[list[int]]) -> bool:
    if not kept:
        return True
    kept_array, colours = np.array(kept), np.array(c)
    return all(np.min(np.sum(kept_array != np.array(p)[colours], axis=1)) >= D for p in PERMUTATIONS)


def worker(args: tuple[int, float]) -> list[str]:
    seed, secs = args
    rng = random.Random(seed)
    kept, start = [], time.time()
    while time.time() - start < secs:
        if not kept or rng.random() < 0.02:
            c, conf = tabu([rng.randrange(3) for _ in range(N)], rng, 300_000)
        else:
            c = list(rng.choice(kept))
            for v in rng.sample(range(N), 60):
                c[v] = rng.randrange(3)
            c, conf = tabu(c, rng, 20_000)
        if conf <= T and far_from_all(c, kept):
            kept.append(c)
    return ["".join(map(str, c)) for c in kept]


def main() -> None:
    if sys.argv[1] == "graph":
        assert regular_graph(N, 6, seed=1) == [tuple(e) for e in verifier.EDGES]
        print("EDGES == regular_graph(300, 6, seed=1)")
        return
    workers, secs = int(sys.argv[1]), float(sys.argv[2])
    with Pool(workers) as pool:
        catalogues = pool.map(worker, [(seed, secs) for seed in range(workers)])
    merged = [c for catalogue in catalogues for c in catalogue][: verifier.MAX_COLOURINGS]
    score = verifier.evaluate({"colourings": merged})
    print(f"per worker {[len(c) for c in catalogues]}; merged score {score:g}")
    (HERE / "target-solution.json").write_text(json.dumps({"colourings": merged}) + "\n")
    # One seed per agent number, each a single good colouring from a different worker.
    (HERE / "seeds").mkdir(exist_ok=True)
    for number, catalogue in enumerate(catalogues[:4], start=1):
        (HERE / "seeds" / f"seed-{number}.json").write_text(json.dumps({"colourings": [catalogue[0]]}) + "\n")
    (HERE / "seeds" / "index.json").write_text(json.dumps({f"seed-{n}.json": 1.0 for n in range(1, 5)}, indent=2) + "\n")


if __name__ == "__main__":
    main()
