import { Pool } from "pg";
import { Sandbox } from "@e2b/code-interpreter";
import { PROBLEMS } from "../src/lib/problems";

const solutionId = Number(process.argv[2] ?? 2299);
const timeoutMs = Number(process.argv[3] ?? 300_000);

if (!Number.isInteger(solutionId)) {
  throw new Error("Usage: npx tsx scripts/time-kissing-e2b.ts [solution_id] [timeout_ms]");
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query(
    `
      select
        s.id,
        s.agent_name as "agentName",
        s.status,
        s.score,
        s.data,
        p.slug
      from solutions s
      join problems p on p.id = s.problem_id
      where s.id = $1
    `,
    [solutionId]
  );
  await pool.end();

  if (result.rows.length === 0) {
    throw new Error(`No solution found for id=${solutionId}`);
  }

  const row = result.rows[0];
  const problem = PROBLEMS.find((p) => p.slug === row.slug);
  if (!problem) {
    throw new Error(`No local problem definition found for slug=${row.slug}`);
  }
  if (!row.slug.startsWith("kissing-number-")) {
    throw new Error(`Solution id=${solutionId} is for ${row.slug}, not a kissing-number problem`);
  }

  const vectors = row.data.vectors;
  if (!Array.isArray(vectors) || !Array.isArray(vectors[0])) {
    throw new Error(`Solution id=${solutionId} does not have vectors`);
  }

  const dataJson = JSON.stringify(row.data);
  const code = `import json
import time
${problem.verifier}
data = json.loads(${JSON.stringify(dataJson)})
t = time.perf_counter()
score = evaluate(data)
elapsed = time.perf_counter() - t
print(f"SCORE:{score}")
print(f"ELAPSED_SECONDS:{elapsed}")`;

  console.log({
    id: row.id,
    slug: row.slug,
    agentName: row.agentName,
    status: row.status,
    storedScore: row.score,
    n: vectors.length,
    d: vectors[0].length,
    payloadBytes: dataJson.length,
    timeoutMs,
  });

  const sandboxStart = Date.now();
  const sbx = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: Math.max(timeoutMs + 60_000, 300_000),
  });
  const ctx = await sbx.createCodeContext();
  console.log({ sandboxReadySeconds: (Date.now() - sandboxStart) / 1000, sandboxId: sbx.sandboxId });

  const runStart = Date.now();
  try {
    const exec = await sbx.runCode(code, {
      context: ctx,
      timeoutMs,
      requestTimeoutMs: timeoutMs,
    });
    console.log({
      runWallSeconds: (Date.now() - runStart) / 1000,
      stdout: exec.logs.stdout,
      stderr: exec.logs.stderr,
      error: exec.error,
    });
  } finally {
    await sbx.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
