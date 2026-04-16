import { z } from "zod";

export const DEFAULT_MIN_IMPROVEMENT = 1e-4;
export const DEFAULT_EVALUATION_MODE = "construction";
export type EvaluationMode = "construction" | "proof";

// "formula_proof": user submits an answer expression + proof body
// "claim_proof":   user submits a discrete claim (yes/no) + proof body
export type ProofKind = "formula_proof" | "claim_proof";

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

  // ── Proof-mode fields (all optional; unused by construction problems) ──

  proofKind?: ProofKind;

  // Trusted Lean wrapper templates with {{answer_expr}}, {{proof}}, etc.
  leanTemplate?: string;
  leanTemplateYes?: string;
  leanTemplateNo?: string;

  // Declaration names the verifier inspects after compilation
  theoremName?: string;
  answerName?: string;
  answerSignature?: string;

  // Exact theorem-shape check snippet
  exactVerifier?: string;

  // Constants the answer must not transitively depend on
  forbiddenAnswerConsts?: string[];

  // Override the default axiom/import allowlists per problem
  allowedAxioms?: string[];
  allowedImportPrefixes?: string[];

  // Discrete claims for yes/no problems
  allowedClaims?: string[];

  // Legacy anti-triviality snippet
  antitrivial?: string;
}
