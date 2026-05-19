import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Pool } from "pg";

const limit = Number(process.argv[2] ?? 100);
const gridPoints = Number(process.argv[3] ?? 200_000);

if (!Number.isInteger(limit) || !Number.isInteger(gridPoints)) {
  throw new Error("Usage: npx tsx scripts/compare-uncertainty-numeric.ts [limit] [grid_points]");
}

const PYTHON_CODE = `
import json
import sys
import time

import mpmath as mp
import numpy as np
from scipy.optimize import brentq
from scipy.special import eval_genlaguerre

MP_DPS = 80
COND_MP_THRESHOLD = 1e15


def laguerre_prime_f64(n, alpha, x):
    if n == 0:
        return 0.0
    return float(-eval_genlaguerre(n - 1, alpha + 1, x))


def build_system_f64(zs):
    m = len(zs)
    alpha = -0.5
    degrees = np.arange(0, 4 * m + 4, 2, dtype=int)
    num_lps = len(degrees)
    num_conditions = 2 * m + 2
    a = np.zeros((num_conditions, num_lps), dtype=np.float64)
    for j, n in enumerate(degrees):
        a[0, j] = eval_genlaguerre(int(n), alpha, 0.0)
        a[1, j] = laguerre_prime_f64(int(n), alpha, 0.0)
    for i, z in enumerate(zs):
        for j, n in enumerate(degrees):
            a[2 * i + 2, j] = eval_genlaguerre(int(n), alpha, z)
            a[2 * i + 3, j] = laguerre_prime_f64(int(n), alpha, z)
    b = np.zeros(num_conditions, dtype=np.float64)
    b[1] = 1.0
    return degrees, alpha, a, b


def gen_laguerre_mp(n, a, x):
    return mp.binomial(n + a, n) * mp.hyp1f1(-n, a + 1, x)


def laguerre_prime_mp(n, a, x):
    if int(n) == 0:
        return mp.mpf(0)
    return -gen_laguerre_mp(int(n) - 1, a + 1, x)


def solve_coeffs_mp(zs, degrees):
    a_mp = mp.mpf("-0.5")
    num_lps = len(degrees)
    num_conditions = 2 * len(zs) + 2
    A = mp.matrix(num_conditions, num_lps)
    bvec = mp.matrix(num_conditions, 1)
    bvec[1, 0] = 1
    zero = mp.mpf(0)
    for j, n in enumerate(degrees):
        A[0, j] = gen_laguerre_mp(int(n), a_mp, zero)
        A[1, j] = laguerre_prime_mp(int(n), a_mp, zero)
    for i, z in enumerate(zs):
        zmp = mp.mpf(str(z))
        for j, n in enumerate(degrees):
            A[2 * i + 2, j] = gen_laguerre_mp(int(n), a_mp, zmp)
            A[2 * i + 3, j] = laguerre_prime_mp(int(n), a_mp, zmp)
    sol = mp.lu_solve(A, bvec)
    return np.array([float(sol[k, 0]) for k in range(num_lps)], dtype=np.float64)


def g_on_grid(xs, coeffs, degrees, alpha):
    out = np.zeros_like(xs, dtype=np.float64)
    for j, n in enumerate(degrees):
        out += coeffs[j] * eval_genlaguerre(int(n), alpha, xs)
    return out


def denom_on_grid(xs, zs):
    p = xs.copy()
    for z in zs:
        d = xs - z
        p *= d * d
    return p


def q_val(x, coeffs, degrees, alpha, zs):
    xs = np.array([x], dtype=np.float64)
    d = float(denom_on_grid(xs, zs)[0])
    if abs(d) < 1e-280:
        return float("nan")
    return float(g_on_grid(xs, coeffs, degrees, alpha)[0]) / d


def evaluate_numeric(data, grid_points):
    t0 = time.perf_counter()
    zs = data["laguerre_double_roots"]
    if len(zs) == 0:
        raise ValueError("laguerre_double_roots must be non-empty")
    if len(zs) > 25:
        raise ValueError("At most 25 roots allowed")
    if any(z <= 0 for z in zs):
        raise ValueError("All roots must be positive")
    if any(z > 300 for z in zs):
        raise ValueError("All roots must be <= 300")
    if len(set(float(z) for z in zs)) != len(zs):
        raise ValueError("Duplicate double-root positions are not allowed")

    zs = [float(z) for z in zs]
    degrees, alpha, a_f64, b_f64 = build_system_f64(zs)
    cond = float(np.linalg.cond(a_f64))
    if cond > COND_MP_THRESHOLD:
        mp.mp.dps = MP_DPS
        coeffs = solve_coeffs_mp(zs, degrees)
        used_mp = True
    else:
        coeffs = np.linalg.solve(a_f64, b_f64)
        used_mp = False

    xmax = float(max(zs)) * 1.5 + 100.0
    xs = np.linspace(1e-9, xmax, grid_points, dtype=np.float64)
    g = g_on_grid(xs, coeffs, degrees, alpha)
    d = denom_on_grid(xs, zs)
    qv = np.divide(g, d, out=np.full_like(g, np.nan), where=np.abs(d) > 1e-280)

    valid = np.isfinite(qv) & (np.abs(qv) < 1e280)
    for z in zs:
        valid &= np.abs(xs - z) > max(1e-6, abs(z) * 1e-9)

    signs = np.sign(qv)
    signs[~valid] = np.nan
    largest = None
    refinements = 0

    for k in range(len(xs) - 1):
        if not valid[k] or not valid[k + 1]:
            continue
        s0 = signs[k]
        s1 = signs[k + 1]
        if s0 == 0 or s1 == 0 or s0 == s1:
            continue
        a_lo = float(xs[k])
        b_hi = float(xs[k + 1])

        def f(t):
            return q_val(t, coeffs, degrees, alpha, zs)

        try:
            r = brentq(f, a_lo, b_hi, maxiter=200)
        except ValueError:
            continue
        if r > 0 and (largest is None or r > largest):
            largest = r
        refinements += 1

    if largest is None:
        raise ValueError("No numerical sign-changing roots found")

    return {
        "score": float(largest / (2 * np.pi)),
        "largest_sign_change": float(largest),
        "n_roots": len(zs),
        "matrix_cond_f64": cond,
        "used_mpmath_solve": used_mp,
        "refined_brackets": refinements,
        "xmax_scan": xmax,
        "grid_points": grid_points,
        "seconds": time.perf_counter() - t0,
    }


payload = json.loads(sys.stdin.read())
out = []
for row in payload["rows"]:
    try:
        result = evaluate_numeric(row["data"], payload["grid_points"])
        out.append({"id": row["id"], "result": result})
    except Exception as e:
        out.append({"id": row["id"], "error": str(e)})
print(json.dumps(out))
`;

type Row = {
  id: number;
  agentName: string;
  status: string;
  score: number;
  data: Record<string, unknown>;
  evaluatedAt: Date;
};

function rootCount(data: Record<string, unknown>): number | null {
  const roots = data.laguerre_double_roots;
  return Array.isArray(roots) ? roots.length : null;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query<Row>(
    `
      select
        s.id,
        s.agent_name as "agentName",
        s.status,
        s.score,
        s.data,
        s.evaluated_at as "evaluatedAt"
      from solutions s
      join problems p on p.id = s.problem_id
      where p.slug = 'uncertainty-principle'
        and s.status = 'evaluated'
        and s.score is not null
      order by s.score asc
      limit $1
    `,
    [limit]
  );
  await pool.end();

  const pyPath = join(tmpdir(), "compare-uncertainty-numeric.py");
  writeFileSync(pyPath, PYTHON_CODE);

  try {
    const output = execFileSync("python3", [pyPath], {
      input: JSON.stringify({ rows: result.rows, grid_points: gridPoints }),
      encoding: "utf8",
      timeout: 900_000,
      maxBuffer: 1024 * 1024 * 50,
    });

    const numeric = JSON.parse(output) as Array<{
      id: number;
      result?: {
        score: number;
        n_roots: number;
        matrix_cond_f64: number;
        used_mpmath_solve: boolean;
        refined_brackets: number;
        seconds: number;
      };
      error?: string;
    }>;

    const byId = new Map(numeric.map((row) => [row.id, row]));
    const rows = result.rows.map((row) => {
      const computed = byId.get(row.id);
      const numericScore = computed?.result?.score ?? null;
      const delta = numericScore === null ? null : numericScore - row.score;
      const ratio = numericScore === null ? null : numericScore / row.score;
      return {
        id: row.id,
        agentName: row.agentName,
        nRoots: rootCount(row.data),
        storedScore: row.score,
        numericScore,
        delta,
        ratio,
        seconds: computed?.result?.seconds ?? null,
        usedMp: computed?.result?.used_mpmath_solve ?? null,
        brackets: computed?.result?.refined_brackets ?? null,
        error: computed?.error ?? null,
      };
    });

    console.log({
      rows: rows.length,
      gridPoints,
      failures: rows.filter((row) => row.error !== null).length,
    });
    console.table(rows);
    writeFileSync(
      "scripts/compare-uncertainty-numeric-results.json",
      JSON.stringify(rows, null, 2)
    );
    console.log("Wrote scripts/compare-uncertainty-numeric-results.json");
  } finally {
    unlinkSync(pyPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
