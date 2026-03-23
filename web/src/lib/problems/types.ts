import { z } from "zod";

export const DEFAULT_MIN_IMPROVEMENT = 1e-4;

export interface ProblemDef {
  slug: string;
  title: string;
  scoring: string;
  minImprovement?: number;
  featured: boolean;
  description: string;
  solutionSchema: Record<string, string>;
  verifier: string;
  zodSchema: z.ZodType;
}
