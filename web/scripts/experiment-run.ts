import { spawn } from "node:child_process";
import { experimentDatabaseName } from "./experiment-names";

const CONFIG = {
  single: {
    arm: "independent",
    redisDatabase: 0,
    port: 3001,
  },
  isolated: {
    arm: "independent",
    redisDatabase: 1,
    port: 3002,
  },
  collaborative: {
    arm: "collaborative",
    redisDatabase: 2,
    port: 3003,
  },
} as const;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is required");
}
if (!process.env.EXPERIMENT_PROBLEM_SLUG) {
  throw new Error("EXPERIMENT_PROBLEM_SLUG is required");
}

const name = process.argv[2] as keyof typeof CONFIG;
const runId = process.argv[3];
const database = experimentDatabaseName(runId, name);
const config = CONFIG[name];

const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.pathname = `/${database}`;
const redisUrl = new URL(process.env.REDIS_URL);
redisUrl.pathname = `/${config.redisDatabase}`;

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl.toString(),
  REDIS_URL: redisUrl.toString(),
  BASE_URL: `http://localhost:${config.port}`,
  EXPERIMENT_ARM: config.arm,
  EXPERIMENT_INSTANCE: name,
  EXPERIMENT_PROBLEM_SLUG: process.env.EXPERIMENT_PROBLEM_SLUG,
};

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", String(config.port)],
  { env, stdio: "inherit" },
);
const worker = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/experiment-worker.ts"],
  { env, stdio: "inherit" },
);

console.log(
  `[experiment-run] ${name} at http://localhost:${config.port} using ${database}`,
);

let stopping = false;
function stop(exitCode: number | null) {
  if (stopping) {
    return;
  }
  stopping = true;
  server.kill("SIGTERM");
  worker.kill("SIGTERM");
  process.exitCode = exitCode ?? 1;
}

server.on("exit", stop);
worker.on("exit", stop);
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
