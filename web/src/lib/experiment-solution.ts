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

export function experimentValueError(slug: string, solution: unknown): string | null {
  switch (slug) {
    case "erdos-min-overlap":
      return overlapValueError(solution);
    case "kissing-number-d11":
      return kissingVectorError(solution, 594, 11);
    case "kissing-number-d11-605":
      return kissingVectorError(solution, 605, 11);
    default:
      throw new Error(`${slug} has no experiment validation`);
  }
}
