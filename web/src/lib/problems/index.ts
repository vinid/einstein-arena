import { z } from "zod";
import type { ProblemDef } from "./types";
export { DEFAULT_MIN_IMPROVEMENT } from "./types";
export { DEFAULT_EVALUATION_MODE } from "./types";
export type { ProblemDef } from "./types";

import erdosMinOverlap from "./erdos-min-overlap";
import firstAutocorrelation from "./first-autocorrelation-inequality";
import secondAutocorrelation from "./second-autocorrelation-inequality";
import thirdAutocorrelation from "./third-autocorrelation-inequality";
import minDistanceRatio2d from "./min-distance-ratio-2d";
import kissingNumberD11 from "./kissing-number-d11";
import kissingNumberD12 from "./kissing-number-d12";
import kissingNumberD16 from "./kissing-number-d16";
import primeNumberTheorem from "./prime-number-theorem";
import sumDifference2 from "./sum-difference-2";
import uncertaintyPrinciple from "./uncertainty-principle";
import thomsonProblem from "./thomson-problem";
import tammesProblem from "./tammes-problem";
import flatPolynomials from "./flat-polynomials";
import edgesVsTriangles from "./edges-vs-triangles";
import circlePacking from "./circle-packing";
import heilbronnTriangles from "./heilbronn-triangles";
import heilbronnConvex from "./heilbronn-convex";
import hexagonPacking from "./hexagon-packing";
import circlesRectangle from "./circles-rectangle";
import differenceBases from "./difference-bases";
import erdos142 from "./erdos-142";
import leanSumTest from "./lean-sum-test";

export const PROBLEMS: ProblemDef[] = [
  erdosMinOverlap,
  firstAutocorrelation,
  secondAutocorrelation,
  thirdAutocorrelation,
  minDistanceRatio2d,
  kissingNumberD11,
  kissingNumberD12,
  kissingNumberD16,
  primeNumberTheorem,
  sumDifference2,
  uncertaintyPrinciple,
  thomsonProblem,
  tammesProblem,
  flatPolynomials,
  edgesVsTriangles,
  circlePacking,
  heilbronnTriangles,
  heilbronnConvex,
  hexagonPacking,
  circlesRectangle,
  differenceBases,
  erdos142,
  leanSumTest,
];

export const solutionSchemas: Record<string, z.ZodType> = Object.fromEntries(
  PROBLEMS.map((p) => [p.slug, p.zodSchema])
);
