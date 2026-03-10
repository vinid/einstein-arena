import { db } from "@/db";
import { solutions, problems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Together from "together-ai";

const MAX_PER_BATCH = 5;

function getTogether() {
  return new Together({ apiKey: process.env.TOGETHER_API_KEY });
}

async function runVerifier(
  verifierCode: string,
  solutionData: Record<string, unknown>
): Promise<{ score?: number; error?: string }> {
  const dataJson = JSON.stringify(solutionData);
  const together = getTogether();

  const setup = await together.codeInterpreter.execute({
    code: "import json\nwith open('data.json') as f:\n    data = json.load(f)\nprint('loaded', len(str(data)))",
    language: "python",
    files: [{ name: "data.json", content: dataJson, encoding: "string" as const }],
  });

  if (setup.errors) {
    return { error: `File upload failed: ${JSON.stringify(setup.errors)}` };
  }

  const sessionId = setup.data.session_id;

  const runCode = `${verifierCode}

score = evaluate(data)
print(f"SCORE:{score}")
`;

  const response = await together.codeInterpreter.execute({
    code: runCode,
    language: "python",
    session_id: sessionId,
  });

  const outputs = response.data?.outputs || [];
  const responseErrors = (response as unknown as { errors?: unknown }).errors;

  if (responseErrors) {
    return { error: typeof responseErrors === "string" ? responseErrors : JSON.stringify(responseErrors) };
  }

  for (const output of outputs) {
    if (output.type === "stderr" && output.data) {
      const stderr = String(output.data);
      if (stderr.includes("Error") || stderr.includes("raise")) {
        const lastLine = stderr.trim().split("\n").pop() || stderr;
        return { error: lastLine };
      }
    }
    if (output.type === "stdout" && typeof output.data === "string") {
      const match = output.data.match(/SCORE:([\d.eE+-]+)/);
      if (match) {
        return { score: parseFloat(match[1]) };
      }
    }
  }

  const allOutput = outputs.map((o) => `${o.type}: ${o.data}`).join("\n");
  return { error: `No score returned. Output: ${allOutput.slice(0, 500)}` };
}

const TOP_N = 100;

async function getGlobalBest(
  problemId: number,
  scoring: string
): Promise<number | null> {
  const agg =
    scoring === "minimize"
      ? sql<number>`min(${solutions.score})`
      : sql<number>`max(${solutions.score})`;

  const rows = await db
    .select({ best: agg })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")));

  return rows[0]?.best ?? null;
}

async function getCutoffScore(
  problemId: number,
  scoring: string
): Promise<number | null> {
  const order = scoring === "minimize"
    ? sql`${solutions.score} asc`
    : sql`${solutions.score} desc`;

  const rows = await db
    .select({ score: solutions.score })
    .from(solutions)
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "evaluated")))
    .orderBy(order)
    .limit(1)
    .offset(TOP_N - 1);

  return rows[0]?.score ?? null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await db
    .select()
    .from(solutions)
    .where(eq(solutions.status, "pending"))
    .limit(MAX_PER_BATCH);

  const problemCache: Record<
    number,
    { slug: string; scoring: string; minImprovement: number; verifier: string }
  > = {};

  let evaluated = 0;

  for (const sol of pending) {
    let problem = problemCache[sol.problemId];
    if (!problem) {
      const rows = await db
        .select({
          slug: problems.slug,
          scoring: problems.scoring,
          minImprovement: problems.minImprovement,
          verifier: problems.verifier,
        })
        .from(problems)
        .where(eq(problems.id, sol.problemId))
        .limit(1);
      problem = rows[0];
      problemCache[sol.problemId] = problem;
    }

    try {
      const result = await runVerifier(
        problem.verifier,
        sol.data as Record<string, unknown>
      );

      if (result.error) {
        await db
          .update(solutions)
          .set({
            status: "error",
            error: result.error,
            evaluatedAt: new Date(),
          })
          .where(eq(solutions.id, sol.id));
        evaluated++;
        continue;
      }

      const score = result.score!;

      const currentBest = await getGlobalBest(sol.problemId, problem.scoring);
      if (currentBest !== null) {
        const dominated =
          problem.scoring === "minimize"
            ? score > currentBest - problem.minImprovement
            : score < currentBest + problem.minImprovement;

        if (dominated) {
          await db.delete(solutions).where(eq(solutions.id, sol.id));
          evaluated++;
          continue;
        }
      }

      const cutoff = await getCutoffScore(sol.problemId, problem.scoring);
      if (cutoff !== null) {
        const belowCutoff =
          problem.scoring === "minimize"
            ? score >= cutoff
            : score <= cutoff;

        if (belowCutoff) {
          await db.delete(solutions).where(eq(solutions.id, sol.id));
          evaluated++;
          continue;
        }
      }

      await db
        .update(solutions)
        .set({
          status: "evaluated",
          score,
          evaluatedAt: new Date(),
        })
        .where(eq(solutions.id, sol.id));

      evaluated++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(solutions)
        .set({
          status: "error",
          error: msg,
          evaluatedAt: new Date(),
        })
        .where(eq(solutions.id, sol.id));
      evaluated++;
    }
  }

  return NextResponse.json({ evaluated, pending: pending.length });
}
