import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Pool } from "pg";
import problem from "../src/lib/problems/kissing-number-d12";

const force = process.argv.includes("--force");

type Row = {
  id: number;
  agentName: string;
  status: string;
  score: number | null;
  error: string | null;
  data: { vectors?: unknown };
  evaluatedAt: Date | null;
};

type Recomputed = {
  id: number;
  agentName: string;
  nVectors: number | null;
  oldStatus: string;
  oldScore: number | null;
  newStatus: "evaluated" | "error";
  newScore: number | null;
  newError: string | null;
  seconds: number;
  changed: boolean;
};

function vectorCount(data: Row["data"]): number | null {
  return Array.isArray(data.vectors) ? data.vectors.length : null;
}

function sameScore(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= 1e-12;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const problemResult = await pool.query(
    "select id from problems where slug = 'kissing-number-d12'"
  );
  if (problemResult.rows.length === 0) {
    throw new Error("kissing-number-d12 problem not found");
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
        data,
        evaluated_at as "evaluatedAt"
      from solutions
      where problem_id = $1
      order by id
    `,
    [problemId]
  );

  console.log({
    mode: force ? "FORCE_WRITE" : "DRY_RUN",
    problem: "kissing-number-d12",
    problemId,
    solutions: solutionResult.rows.length,
  });

  const verifierPath = join(tmpdir(), "kissing-d12-update-verifier.py");
  const inputPath = join(tmpdir(), "kissing-d12-update-input.json");

  writeFileSync(
    verifierPath,
    `${problem.verifier}

if __name__ == "__main__":
    import json
    import sys
    import time

    with open(sys.argv[1]) as f:
        data = json.load(f)

    t = time.perf_counter()
    try:
        score = evaluate(data)
        print(json.dumps({"score": score, "seconds": time.perf_counter() - t}))
    except Exception as e:
        print(json.dumps({"error": str(e), "seconds": time.perf_counter() - t}))
`
  );

  const results: Recomputed[] = [];

  try {
    for (const row of solutionResult.rows) {
      writeFileSync(inputPath, JSON.stringify(row.data));

      process.stdout.write(`id=${row.id} agent=${row.agentName}... `);
      const output = execFileSync("python3", [verifierPath, inputPath], {
        encoding: "utf8",
        timeout: 900_000,
      });
      const parsed = JSON.parse(output);

      const newStatus = parsed.error ? "error" : "evaluated";
      const newScore = parsed.error ? null : Number(parsed.score);
      const newError = parsed.error ? String(parsed.error) : null;
      const changed =
        row.status !== newStatus ||
        !sameScore(row.score, newScore) ||
        (row.error ?? null) !== newError;

      const recomputed: Recomputed = {
        id: row.id,
        agentName: row.agentName,
        nVectors: vectorCount(row.data),
        oldStatus: row.status,
        oldScore: row.score,
        newStatus,
        newScore,
        newError,
        seconds: Number(parsed.seconds),
        changed,
      };
      results.push(recomputed);

      console.log({
        oldStatus: row.status,
        oldScore: row.score,
        newStatus,
        newScore,
        seconds: recomputed.seconds,
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
          [newStatus, newScore, newError, row.id]
        );
      }
    }
  } finally {
    unlinkSync(verifierPath);
    unlinkSync(inputPath);
    await pool.end();
  }

  const changed = results.filter((r) => r.changed);
  const errors = results.filter((r) => r.newStatus === "error");

  console.log("\n=== Summary ===");
  console.log({
    mode: force ? "FORCE_WRITE" : "DRY_RUN",
    total: results.length,
    changed: changed.length,
    errors: errors.length,
    totalSeconds: results.reduce((acc, r) => acc + r.seconds, 0),
  });

  if (changed.length > 0) {
    console.log("\nChanged rows:");
    console.table(
      changed.map((r) => ({
        id: r.id,
        agentName: r.agentName,
        nVectors: r.nVectors,
        oldStatus: r.oldStatus,
        oldScore: r.oldScore,
        newStatus: r.newStatus,
        newScore: r.newScore,
        seconds: r.seconds,
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
