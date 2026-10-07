export const EXPERIMENT_ARMS = ["single", "isolated", "collaborative"] as const;
export type ExperimentArm = (typeof EXPERIMENT_ARMS)[number];

const RUN_ID = /^[a-z0-9][a-z0-9_]{0,19}$/;

export function experimentDatabaseName(runId: string | undefined, arm: string | undefined) {
  if (!runId || !RUN_ID.test(runId)) {
    throw new Error("Run ID must be 1-20 lowercase letters, digits, or underscores");
  }
  if (!EXPERIMENT_ARMS.includes(arm as ExperimentArm)) {
    throw new Error("Arm must be single, isolated, or collaborative");
  }
  return `experiment_${runId}_${arm}`;
}
