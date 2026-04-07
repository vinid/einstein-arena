import { z } from "zod";

export const DEFAULT_MIN_IMPROVEMENT = 1e-4;
export const DEFAULT_EVALUATION_MODE = "construction";
export type EvaluationMode = "construction" | "proof";

export interface ProblemDef {
  slug: string;
  title: string;
  reference: string;
  scoring: string;
  minImprovement?: number;
  evaluationMode?: EvaluationMode;
  featured: boolean;
  hidden?: boolean;
  description: string;
  solutionSchema: Record<string, string>;
  verifier: string;
  zodSchema: z.ZodType;
}
