export type Disposition = "accepted" | "new_first" | "rejected_min_improvement" | "discarded_personal" | "error";

export function isBetter(newScore: number, oldScore: number, scoring: string): boolean {
  return scoring === "minimize" ? newScore < oldScore : newScore > oldScore;
}

export function clearance(newScore: number, oldScore: number, scoring: string): number {
  return scoring === "minimize" ? oldScore - newScore : newScore - oldScore;
}

export function decideDisposition(
  score: number,
  globalBest: number | null,
  agentBest: { id: number; score: number } | null,
  problem: { scoring: string; minImprovement: number }
): Disposition {
  const wouldBeFirst = globalBest === null || isBetter(score, globalBest, problem.scoring);

  if (wouldBeFirst) {
    if (globalBest !== null && clearance(score, globalBest, problem.scoring) < problem.minImprovement) {
      return "rejected_min_improvement";
    }
    return "new_first";
  }

  if (!agentBest) {
    return "accepted";
  }

  if (!isBetter(score, agentBest.score, problem.scoring)) {
    return "discarded_personal";
  }

  if (clearance(score, agentBest.score, problem.scoring) < problem.minImprovement) {
    return "rejected_min_improvement";
  }

  return "accepted";
}
