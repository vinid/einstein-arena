function normalizeSumConstraint(arr: number[]): number[] {
  const targetSum = arr.length / 2.0;
  let currentSum = 0;
  for (let i = 0; i < arr.length; i++) currentSum += arr[i];

  if (currentSum !== targetSum) {
    if (currentSum === 0.0) {
      throw new Error("Cannot normalize sequence with zero total sum.");
    }
    const factor = targetSum / currentSum;
    return arr.map((v) => v * factor);
  }
  return arr.slice();
}

export function evaluate(data: { h_values: number[] }): number {
  const { h_values } = data;

  for (let i = 0; i < h_values.length; i++) {
    if (Number.isNaN(h_values[i])) throw new Error("h_values contains NaN");
    if (h_values[i] < 0 || h_values[i] > 1) {
      throw new Error("All values in h_values must be between 0 and 1");
    }
  }

  const h = normalizeSumConstraint(h_values);

  for (let i = 0; i < h.length; i++) {
    if (h[i] < 0 || h[i] > 1) {
      throw new Error("After normalization, all values must be between 0 and 1");
    }
  }

  const n = h.length;
  const oneMinusH = h.map((v) => 1 - v);
  const corrLen = 2 * n - 1;
  let maxCorr = -Infinity;

  for (let k = 0; k < corrLen; k++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const j = i + k - (n - 1);
      if (j >= 0 && j < n) {
        total += h[i] * oneMinusH[j];
      }
    }
    if (total > maxCorr) maxCorr = total;
  }

  return (maxCorr / n) * 2;
}
