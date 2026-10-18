import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/db/schema";
import { experimentDatabaseName } from "./experiment-names";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const baseUrl = new URL(process.env.DATABASE_URL);
const databasePort = baseUrl.port || "5432";
if (!["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
  throw new Error("Experiment databases can only be created on localhost");
}
if (databasePort !== "55432") {
  throw new Error(
    `Experiment Postgres is published on port 55432. DATABASE_URL uses port ${databasePort}.`,
  );
}

// The task folder holds the whole problem: problem.json, description.md and verifier.py.
const taskDir = process.env.EXPERIMENT_TASK_DIR;
if (!taskDir) {
  throw new Error("EXPERIMENT_TASK_DIR is required");
}
const problem = JSON.parse(readFileSync(join(taskDir, "problem.json"), "utf8"));
const description = readFileSync(join(taskDir, "description.md"), "utf8");
const verifier = readFileSync(join(taskDir, "verifier.py"), "utf8");

const [runId, arm] = process.argv.slice(2);
if (!arm) {
  throw new Error("Usage: experiment-db.ts <run-id> <arm>");
}
const name = experimentDatabaseName(runId, arm);

function databaseUrl(database: string) {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function main() {
  const admin = new Pool({ connectionString: databaseUrl("postgres") });
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (existing.rowCount) {
    await admin.end();
    throw new Error(`${name} already exists; every run needs a fresh database, so pick a new run ID`);
  }
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const pool = new Pool({ connectionString: databaseUrl(name) });
  const database = drizzle(pool, { schema });
  await migrate(database, { migrationsFolder: "./drizzle" });
  await database.insert(schema.problems).values({
    slug: problem.slug,
    title: problem.title,
    description,
    scoring: problem.scoring,
    verifier,
    solutionSchema: problem.solutionSchema,
    minImprovement: problem.minImprovement,
    evaluationMode: "construction",
    featured: false,
    hidden: false,
  });
  await pool.end();
  console.log(`[experiment-db] created ${name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
