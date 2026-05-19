import { Pool } from "pg";
import { Sandbox } from "@e2b/code-interpreter";
import problem from "../src/lib/problems/uncertainty-principle";

const solutionIdArg = process.argv[2] ? Number(process.argv[2]) : null;
const targetRoots = Number(process.argv[3] ?? 14);
const timeoutMs = Number(process.argv[4] ?? 300_000);
const padToRoots = process.argv[5] ? Number(process.argv[5]) : null;

if (solutionIdArg !== null && !Number.isInteger(solutionIdArg)) {
  throw new Error("Usage: npx tsx scripts/time-uncertainty-e2b.ts [solution_id] [n_roots] [timeout_ms]");
}

type SolutionRow = {
  id: number;
  agentName: string;
  status: string;
  score: number | null;
  data: Record<string, unknown>;
};

function rootCount(data: Record<string, unknown>): number | null {
  const roots = data.laguerre_double_roots;
  return Array.isArray(roots) ? roots.length : null;
}

function padRoots(data: Record<string, unknown>, target: number | null) {
  if (target === null) return data;
  const roots = data.laguerre_double_roots;
  if (!Array.isArray(roots)) return data;
  const padded = roots.map(Number);
  let next = Math.max(...padded) + 5;
  while (padded.length < target) {
    padded.push(next);
    next += 5;
  }
  return { ...data, laguerre_double_roots: padded };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let row: SolutionRow | undefined;
  if (solutionIdArg !== null) {
    const result = await pool.query<SolutionRow>(
      `
        select
          s.id,
          s.agent_name as "agentName",
          s.status,
          s.score,
          s.data
        from solutions s
        join problems p on p.id = s.problem_id
        where s.id = $1 and p.slug = 'uncertainty-principle'
      `,
      [solutionIdArg]
    );
    row = result.rows[0];
  } else {
    const result = await pool.query<SolutionRow>(
      `
        select
          s.id,
          s.agent_name as "agentName",
          s.status,
          s.score,
          s.data
        from solutions s
        join problems p on p.id = s.problem_id
        where p.slug = 'uncertainty-principle'
          and jsonb_array_length(s.data->'laguerre_double_roots') = $1
        order by s.status = 'evaluated' desc, s.score asc nulls last, s.id desc
        limit 1
      `,
      [targetRoots]
    );
    row = result.rows[0];
  }

  await pool.end();

  if (!row) {
    throw new Error(solutionIdArg !== null
      ? `No uncertainty-principle solution found for id=${solutionIdArg}`
      : `No uncertainty-principle solution found with ${targetRoots} roots`);
  }

  const data = padRoots(row.data, padToRoots);
  const nRoots = rootCount(data);
  const dataJson = JSON.stringify(data);
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
    agentName: row.agentName,
    status: row.status,
    storedScore: row.score,
    nRoots,
    sourceRoots: rootCount(row.data),
    padToRoots,
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
