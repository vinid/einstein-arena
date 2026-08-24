import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Pool } from "pg";

// Read-only audit. For circle-packing / circles-rectangle / heilbronn-triangles
// it recomputes the exact worst constraint violation of every stored solution
// and reports how much of the verifier's 1e-9 feasibility slack each one uses,
// expressed in units of the problem's minImprovement.
//
// Usage: npx tsx scripts/audit-tolerance.ts [slug ...]

const CONFIG: Record<
  string,
  { tol: number; minImprovement: number }
> = {
  "circle-packing": { tol: 1e-9, minImprovement: 1e-10 },
  "circles-rectangle": { tol: 1e-9, minImprovement: 1e-10 },
  "heilbronn-triangles": { tol: 1e-9, minImprovement: 1e-9 },
};

const DIAGNOSTIC: Record<string, string> = {
  "circle-packing": `import numpy as np

def diagnose(data):
    circles = np.array(data["circles"], dtype=np.float64)
    if circles.shape != (26, 3):
        return {"valid": False, "reason": "shape"}
    if not np.isfinite(circles).all():
        return {"valid": False, "reason": "nonfinite"}
    centers = circles[:, :2]
    radii = circles[:, 2]
    if not (radii >= 0).all():
        return {"valid": False, "reason": "neg_radius"}
    lower = float(np.max(radii[:, None] - centers))
    upper = float(np.max(centers - (1 - radii[:, None])))
    contain = max(0.0, lower, upper)
    overlap = 0.0
    n = 26
    for i in range(n):
        for j in range(i + 1, n):
            dist = float(np.sqrt(np.sum((centers[i] - centers[j]) ** 2)))
            v = float(radii[i] + radii[j] - dist)
            if v > overlap:
                overlap = v
    worst = max(contain, overlap)
    return {
        "valid": True,
        "score": float(np.sum(radii)),
        "contain_viol": contain,
        "overlap_viol": overlap,
        "worst_viol": worst,
    }
`,
  "circles-rectangle": `import numpy as np
import itertools

def diagnose(data):
    circles = np.array(data["circles"], dtype=np.float64)
    if circles.shape != (21, 3):
        return {"valid": False, "reason": "shape"}
    if not np.isfinite(circles).all():
        return {"valid": False, "reason": "nonfinite"}
    radii = circles[:, 2]
    if not (radii > 0).all():
        return {"valid": False, "reason": "nonpos_radius"}
    min_x = float(np.min(circles[:, 0] - radii))
    max_x = float(np.max(circles[:, 0] + radii))
    min_y = float(np.min(circles[:, 1] - radii))
    max_y = float(np.max(circles[:, 1] + radii))
    width = max_x - min_x
    height = max_y - min_y
    bbox_viol = max(0.0, float(width + height - 2.0))
    overlap = 0.0
    for c1, c2 in itertools.combinations(circles, 2):
        dist = float(np.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2))
        v = float(c1[2] + c2[2] - dist)
        if v > overlap:
            overlap = v
    worst = max(bbox_viol, overlap)
    return {
        "valid": True,
        "score": float(np.sum(radii)),
        "bbox_viol": bbox_viol,
        "overlap_viol": overlap,
        "worst_viol": worst,
    }
`,
  "heilbronn-triangles": `import numpy as np

def diagnose(data):
    points = np.array(data["points"], dtype=np.float64)
    if points.shape != (11, 2):
        return {"valid": False, "reason": "shape"}
    if not np.isfinite(points).all():
        return {"valid": False, "reason": "nonfinite"}
    sq3 = np.sqrt(3)
    worst = 0.0
    for x, y in points:
        worst = max(worst, float(-y))
        worst = max(worst, float(sq3 * x + y - sq3))
        worst = max(worst, float(y - sq3 * x))
    return {
        "valid": True,
        "contain_viol": max(0.0, worst),
        "worst_viol": max(0.0, worst),
    }
`,
};

type Row = {
  id: number;
  agentName: string;
  status: string;
  score: number | null;
  data: unknown;
  evaluatedAt: Date | null;
};

async function auditSlug(pool: Pool, slug: string) {
  const cfg = CONFIG[slug];
  const diag = DIAGNOSTIC[slug];
  if (!cfg || !diag) {
    throw new Error(`No audit config for slug ${slug}`);
  }

  const problemResult = await pool.query(
    "select id from problems where slug = $1",
    [slug]
  );
  if (problemResult.rows.length === 0) {
    throw new Error(`problem ${slug} not found`);
  }
  const problemId = problemResult.rows[0].id;

  const solutionResult = await pool.query<Row>(
    `
      select id, agent_name as "agentName", status, score, data,
             evaluated_at as "evaluatedAt"
      from solutions
      where problem_id = $1 and status = 'evaluated'
      order by score desc nulls last, evaluated_at asc
    `,
    [problemId]
  );

  const verifierPath = join(tmpdir(), `audit-${slug}.py`);
  const inputPath = join(tmpdir(), `audit-${slug}-input.json`);
  writeFileSync(
    verifierPath,
    `${diag}

if __name__ == "__main__":
    import json, sys
    with open(sys.argv[1]) as f:
        data = json.load(f)
    print(json.dumps(diagnose(data)))
`
  );

  const rows: Array<Record<string, unknown>> = [];
  try {
    for (const row of solutionResult.rows) {
      writeFileSync(inputPath, JSON.stringify(row.data));
      const output = execFileSync("python3", [verifierPath, inputPath], {
        encoding: "utf8",
        timeout: 120_000,
      });
      const d = JSON.parse(output);
      const worst = typeof d.worst_viol === "number" ? d.worst_viol : null;
      const stored = row.score;
      // "penalty" = reporter's option 2: subtract the single worst violation.
      const penalized =
        stored !== null && worst !== null ? stored - worst : stored;
      rows.push({
        id: row.id,
        agentName: row.agentName,
        storedScore: stored,
        worstViol: worst,
        penalizedScore: penalized,
        feasibleAt1e12: worst !== null ? worst <= 1e-12 : null,
        violatesStated: worst !== null ? worst > 0 : null,
      });
    }
  } finally {
    unlinkSync(verifierPath);
    unlinkSync(inputPath);
  }

  console.log(`\n=== ${slug} ===`);
  console.log({
    problemId,
    evaluatedSolutions: rows.length,
    violatingStatedConstraint: rows.filter((r) => r.violatesStated === true)
      .length,
  });

  console.log("\n-- current (raw float64) ranking --");
  console.table(rows.map((r) => ({ id: r.id, agentName: r.agentName, storedScore: r.storedScore, worstViol: r.worstViol })));

  console.log("\n-- option 2: ranking after subtracting worst violation --");
  console.table(
    [...rows]
      .sort((a, b) => (Number(b.penalizedScore) - Number(a.penalizedScore)))
      .map((r) => ({ id: r.id, agentName: r.agentName, penalizedScore: r.penalizedScore, worstViol: r.worstViol }))
  );

  console.log("\n-- option A: only exactly-feasible submissions (worst_viol <= 1e-12) --");
  console.table(
    rows
      .filter((r) => r.feasibleAt1e12 === true)
      .map((r) => ({ id: r.id, agentName: r.agentName, storedScore: r.storedScore, worstViol: r.worstViol }))
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }
  const slugs =
    process.argv.slice(2).length > 0
      ? process.argv.slice(2)
      : Object.keys(CONFIG);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const slug of slugs) {
      await auditSlug(pool, slug);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
