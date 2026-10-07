import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/db/schema";
import { DEFAULT_EVALUATION_MODE, PROBLEMS } from "../src/lib/problems";
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

if (!process.env.EXPERIMENT_PROBLEM_SLUG) {
  throw new Error("EXPERIMENT_PROBLEM_SLUG is required");
}
if (!process.env.EXPERIMENT_MIN_IMPROVEMENT) {
  throw new Error("EXPERIMENT_MIN_IMPROVEMENT is required");
}
const minImprovement = Number(process.env.EXPERIMENT_MIN_IMPROVEMENT);
if (!Number.isFinite(minImprovement) || minImprovement < 0) {
  throw new Error("EXPERIMENT_MIN_IMPROVEMENT must be a non-negative number");
}
const problem = PROBLEMS.find(
  ({ slug }) => slug === process.env.EXPERIMENT_PROBLEM_SLUG,
);
if (!problem) {
  throw new Error(`${process.env.EXPERIMENT_PROBLEM_SLUG} is not registered`);
}
const experimentProblem = problem;
if (!process.env.EXPERIMENT_VERIFIER_FILE) {
  throw new Error("EXPERIMENT_VERIFIER_FILE is required");
}
const verifier = readFileSync(process.env.EXPERIMENT_VERIFIER_FILE, "utf8");
if (process.env.EXPERIMENT_SCORING !== experimentProblem.scoring) {
  throw new Error(
    `EXPERIMENT_SCORING must be ${experimentProblem.scoring} for ${experimentProblem.slug}`,
  );
}

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
    console.log(`[experiment-db] using existing ${name}`);
    return;
  }
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const pool = new Pool({ connectionString: databaseUrl(name) });
  const database = drizzle(pool, { schema });
  await migrate(database, { migrationsFolder: "./drizzle" });
  await database.insert(schema.problems).values({
    slug: experimentProblem.slug,
    title: experimentProblem.title,
    description: experimentProblem.description,
    scoring: experimentProblem.scoring,
    verifier,
    solutionSchema: experimentProblem.solutionSchema,
    minImprovement,
    evaluationMode:
      experimentProblem.evaluationMode ?? DEFAULT_EVALUATION_MODE,
    featured: experimentProblem.featured,
    hidden: false,
  });
  await pool.end();
  console.log(`[experiment-db] created ${name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
