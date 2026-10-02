import { spawn } from "node:child_process";

const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 10_000;
const SCORE_MARKER = "__EINSTEIN_ARENA_SCORE__:";

export function evaluateLocally(
  verifier: string,
  solution: Record<string, unknown>,
): Promise<number> {
  const python = process.env.EXPERIMENT_PYTHON ?? "python3";
  const code = `${verifier}

import json
import sys

data = json.load(sys.stdin)
score = evaluate(data)
print("${SCORE_MARKER}" + repr(float(score)))
`;

  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-c", code], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("Verifier timed out")));
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += chunk.toString();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += chunk.toString();
      }
    });
    child.on("error", (error) => {
      finish(() => reject(error));
    });
    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Verifier exited with code ${code}`));
          return;
        }
        const markerIndex = stdout.lastIndexOf(SCORE_MARKER);
        if (markerIndex === -1) {
          reject(new Error("Verifier returned no score"));
          return;
        }
        const score = Number(
          stdout.slice(markerIndex + SCORE_MARKER.length).trim(),
        );
        if (!Number.isFinite(score)) {
          reject(new Error("Verifier returned a non-finite score"));
          return;
        }
        resolve(score);
      });
    });

    child.stdin.end(JSON.stringify(solution));
  });
}
