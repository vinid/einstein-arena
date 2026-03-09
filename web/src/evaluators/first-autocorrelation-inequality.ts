export function evaluate(data: { f_values: number[] }): number {
  const { f_values } = data;

  let fSum = 0;
  for (let i = 0; i < f_values.length; i++) {
    if (Number.isNaN(f_values[i])) throw new Error("f_values contains NaN");
    if (f_values[i] < 0) throw new Error("All f_values must be non-negative");
    fSum += f_values[i];
  }

  if (fSum === 0) {
    throw new Error("The integral of f must be non-trivially positive");
  }

  const n = f_values.length;
  const dx = 0.5 / n;
  const convLen = 2 * n - 1;
  let maxAutoconv = -Infinity;

  for (let k = 0; k < convLen; k++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const j = k - i;
      if (j >= 0 && j < n) {
        total += f_values[i] * f_values[j];
      }
    }
    const val = total * dx;
    if (val > maxAutoconv) maxAutoconv = val;
  }

  const integralSq = (fSum * dx) ** 2;
  return maxAutoconv / integralSq;
}
