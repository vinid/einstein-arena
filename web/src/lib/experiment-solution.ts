const DECIMAL_STRING = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function overlapValueError(solution: unknown): string | null {
  if (!solution || typeof solution !== "object" || !("values" in solution)) {
    return "solution.values is required";
  }
  const values = (solution as { values: unknown }).values;
  if (!Array.isArray(values) || values.length < 1 || values.length > 100_000) {
    return "solution.values must contain 1 to 100000 numbers";
  }
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      return "solution.values must contain only finite numbers from 0 through 1";
    }
  }
  return null;
}

function autocorrelationValueError(solution: unknown, maxLength: number): string | null {
  if (!solution || typeof solution !== "object" || !("values" in solution)) {
    return "solution.values is required";
  }
  const values = (solution as { values: unknown }).values;
  if (!Array.isArray(values) || values.length < 1 || values.length > maxLength) {
    return `solution.values must contain 1 to ${maxLength} numbers`;
  }
  let positive = false;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return "solution.values must contain only finite non-negative numbers";
    }
    positive ||= value > 0;
  }
  if (!positive) {
    return "solution.values must contain at least one positive number";
  }
  return null;
}

function differenceBasisError(solution: unknown): string | null {
  if (!solution || typeof solution !== "object" || !("set" in solution)) {
    return "solution.set is required";
  }
  const set = (solution as { set: unknown }).set;
  if (!Array.isArray(set) || set.length < 1) {
    return "solution.set must be a non-empty list of integers";
  }
  for (const value of set) {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      return "solution.set must contain only non-negative integers";
    }
  }
  // The verifier adds 0 and scores anything above 2000 distinct elements as infinity.
  if (new Set([0, ...set]).size > 2000) {
    return "solution.set must have at most 2000 distinct elements, including 0";
  }
  return null;
}

function edgesWeightsError(solution: unknown): string | null {
  if (!solution || typeof solution !== "object" || !("weights" in solution)) {
    return "solution.weights is required";
  }
  const weights = (solution as { weights: unknown }).weights;
  if (!Array.isArray(weights) || weights.length < 1 || weights.length > 500) {
    return "solution.weights must contain 1 to 500 rows";
  }
  for (const [index, row] of weights.entries()) {
    if (!Array.isArray(row) || row.length !== 20) {
      return `solution.weights[${index}] must contain exactly 20 numbers`;
    }
    let sum = 0;
    for (const value of row) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return `solution.weights[${index}] must contain only finite non-negative numbers`;
      }
      sum += value;
    }
    if (sum < 1e-7) {
      return `solution.weights[${index}] sums to near zero`;
    }
  }
  return null;
}

function kissingVectorError(
  solution: unknown,
  count: number,
  dimension: number,
): string | null {
  if (!solution || typeof solution !== "object" || !("vectors" in solution)) {
    return "solution.vectors is required";
  }
  const vectors = (solution as { vectors: unknown }).vectors;
  if (!Array.isArray(vectors) || vectors.length !== count) {
    return `solution.vectors must contain exactly ${count} vectors`;
  }
  for (const [index, vector] of vectors.entries()) {
    if (!Array.isArray(vector) || vector.length !== dimension) {
      return `solution.vectors[${index}] must contain exactly ${dimension} numbers`;
    }
    let nonZero = false;
    for (const component of vector) {
      if (typeof component === "number") {
        if (!Number.isFinite(component)) {
          return `solution.vectors[${index}] must contain only finite numbers`;
        }
        nonZero ||= component !== 0;
      } else if (typeof component === "string") {
        if (!DECIMAL_STRING.test(component)) {
          return `solution.vectors[${index}] contains a string that is not a decimal number`;
        }
        nonZero ||= /[1-9]/.test(component.split(/[eE]/)[0]);
      } else {
        return `solution.vectors[${index}] must contain only numbers or decimal strings`;
      }
    }
    if (!nonZero) {
      return `solution.vectors[${index}] must be non-zero`;
    }
  }
  return null;
}

function twoDeletionWordsError(solution: unknown): string | null {
  if (!solution || typeof solution !== "object" || !("words" in solution)) {
    return "solution.words is required";
  }
  const words = (solution as { words: unknown }).words;
  if (!Array.isArray(words) || words.length < 1 || words.length > 16_384) {
    return "solution.words must contain 1 to 16384 codewords";
  }
  for (const word of words) {
    if (typeof word !== "string" || !/^[01]{16}$/.test(word)) {
      return "solution.words must contain only 16-character binary strings";
    }
  }
  if (new Set(words).size !== words.length) {
    return "solution.words must be distinct";
  }
  return null;
}

function snakeActionsError(solution: unknown): string | null {
  if (!solution || typeof solution !== "object" || !("actions" in solution)) {
    return "solution.actions is required";
  }
  const actions = (solution as { actions: unknown }).actions;
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 8_191) {
    return "solution.actions must contain 1 to 8191 integers";
  }
  for (const action of actions) {
    if (!Number.isInteger(action) || (action as number) < 0 || (action as number) > 12) {
      return "solution.actions must contain only integers from 0 through 12";
    }
  }
  return null;
}

export function experimentValueError(slug: string, solution: unknown): string | null {
  switch (slug) {
    case "snake-in-the-box-13":
      return snakeActionsError(solution);
    case "two-deletion-code-16":
      return twoDeletionWordsError(solution);
    case "erdos-min-overlap":
      return overlapValueError(solution);
    case "first-autocorrelation-inequality":
      return autocorrelationValueError(solution, 100_000);
    case "second-autocorrelation-inequality":
      return autocorrelationValueError(solution, 2_000_000);
    case "difference-bases":
      return differenceBasisError(solution);
    case "edges-vs-triangles":
      return edgesWeightsError(solution);
    case "kissing-number-d11":
      return kissingVectorError(solution, 594, 11);
    case "kissing-number-d11-605":
      return kissingVectorError(solution, 605, 11);
    default:
      throw new Error(`${slug} has no experiment validation`);
  }
}
