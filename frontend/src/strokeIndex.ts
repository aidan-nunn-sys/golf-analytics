export function isStrokeIndexPermutation(values: number[], n: number): boolean {
  if (values.length !== n) return false;
  if (!values.every((v) => Number.isInteger(v))) return false;
  return [...values].sort((a, b) => a - b).every((v, i) => v === i + 1);
}
