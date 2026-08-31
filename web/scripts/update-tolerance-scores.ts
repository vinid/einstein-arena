import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Pool } from "pg";
import circlePacking from "../src/lib/problems/circle-packing";
import circlesRectangle from "../src/lib/problems/circles-rectangle";
import heilbronnTriangles from "../src/lib/problems/heilbronn-triangles";

const force = process.argv.includes("--force");
const slugs = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"));

const PROBLEMS: Record<string, string> = {
  "circle-packing": circlePacking.verifier,
  "circles-rectangle": circlesRectangle.verifier,
  "heilbronn-triangles": heilbronnTriangles.verifier,
};

type Row = {
  id: number;
  agentName: string;
  status: string;
  score: number | null;
  error: string | null;
  data: unknown;
};

type Recomputed = {
  slug: string;
  id: number;
  agentName: string;
  oldStatus: string;
  oldScore: number | null;
  newStatus: "evaluated" | "error";
  newScore: number | null;
  newError: string | null;
  seconds: number;
  changed: boolean;
};

function sameScore(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= 1e-12;
}

function classify(parsed: { score?: unknown; error?: unknown }): {
  status: "evaluated" | "error";
  score: number | null;
  error: string | null;
} {
  if (parsed.error) {
    return {
      status: "error",
      score: null,
      error: String(parsed.error),
    };
  }
  const score = Number(parsed.score);
  if (!Number.isFinite(score)) {
    return {
      status: "error",
      score: null,
      error: `verifier returned non-finite score: ${parsed.score}`,
    };
  }
  return { status: "evaluated", score, error: null };
}

async function updateSlug(pool: Pool, slug: string, results: Recomputed[]) {
  const verifier = PROBLEMS[slug];
  if (!verifier) {
    throw new Error(`unknown slug ${slug}`);
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
      select
        id,
        agent_name as "agentName",
        status,
        score,
        error,
        data
      from solutions
      where problem_id = $1 and status = 'evaluated'
      order by id
    `,
    [problemId]
  );

  console.log({
    slug,
    problemId,
    evaluatedSolutions: solutionResult.rows.length,
  });

  const verifierPath = join(tmpdir(), `update-tolerance-${slug}.py`);
  const inputPath = join(tmpdir(), `update-tolerance-${slug}-input.json`);
  writeFileSync(
    verifierPath,
    `${verifier}

if __name__ == "__main__":
    import json
    import sys
    import time

    with open(sys.argv[1]) as f:
        data = json.load(f)

    t = time.perf_counter()
    score = evaluate(data)
    if score == score and abs(score) != float("inf"):
        payload = {"score": float(score), "seconds": time.perf_counter() - t}
    else:
        payload = {"score": None, "error": f"verifier returned non-finite score: {score}", "seconds": time.perf_counter() - t}
    print(json.dumps(payload))
`
  );

  try {
    for (const row of solutionResult.rows) {
      writeFileSync(inputPath, JSON.stringify(row.data));
      process.stdout.write(`${slug} id=${row.id} agent=${row.agentName}... `);
      const output = execFileSync("python3", [verifierPath, inputPath], {
        encoding: "utf8",
        timeout: 120_000,
      });
      const parsed = JSON.parse(output);
      const next = classify(parsed);
      const changed =
        row.status !== next.status ||
        !sameScore(row.score, next.score) ||
        (row.error ?? null) !== next.error;

      const recomputed: Recomputed = {
        slug,
        id: row.id,
        agentName: row.agentName,
        oldStatus: row.status,
        oldScore: row.score,
        newStatus: next.status,
        newScore: next.score,
        newError: next.error,
        seconds: Number(parsed.seconds),
        changed,
      };
      results.push(recomputed);

      console.log({
        oldScore: row.score,
        newStatus: next.status,
        newScore: next.score,
        changed,
      });

      if (force && changed) {
        await pool.query(
          `
            update solutions
            set status = $1,
                score = $2,
                error = $3,
                evaluated_at = now()
            where id = $4
          `,
          [next.status, next.score, next.error, row.id]
        );
      }
    }
  } finally {
    unlinkSync(verifierPath);
    unlinkSync(inputPath);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }

  const targets = slugs.length > 0 ? slugs : Object.keys(PROBLEMS);
  for (const slug of targets) {
    if (!PROBLEMS[slug]) {
      throw new Error(`unknown slug ${slug}`);
    }
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const results: Recomputed[] = [];

  console.log({
    mode: force ? "FORCE_WRITE" : "DRY_RUN",
    targets,
  });

  try {
    for (const slug of targets) {
      await updateSlug(pool, slug, results);
    }
  } finally {
    await pool.end();
  }

  const changed = results.filter((r) => r.changed);
  console.log("\n=== Summary ===");
  console.log({
    mode: force ? "FORCE_WRITE" : "DRY_RUN",
    total: results.length,
    changed: changed.length,
    invalidated: changed.filter((r) => r.newStatus === "error").length,
  });

  if (changed.length > 0) {
    console.log("\nChanged rows:");
    console.table(
      changed.map((r) => ({
        slug: r.slug,
        id: r.id,
        agentName: r.agentName,
        oldScore: r.oldScore,
        newStatus: r.newStatus,
        newScore: r.newScore,
        error: r.newError,
      }))
    );
  }

  if (!force) {
    console.log("\nDry run only. Re-run with --force to update the database.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
