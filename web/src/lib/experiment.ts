export type ExperimentArm = "independent" | "collaborative";

export function getExperimentArm(): ExperimentArm | null {
  const arm = process.env.EXPERIMENT_ARM;
  if (!arm) {
    return null;
  }
  if (arm !== "independent" && arm !== "collaborative") {
    throw new Error(`Invalid EXPERIMENT_ARM: ${arm}`);
  }
  return arm;
}

export function isExperimentMode() {
  return getExperimentArm() !== null;
}

export function isCollaborativeExperiment() {
  return getExperimentArm() === "collaborative";
}
