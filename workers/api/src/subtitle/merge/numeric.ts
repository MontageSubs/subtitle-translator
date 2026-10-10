import { scanWeights } from "../common/lineMetrics";

export function buildWeightPrefix(text: string): Float64Array {
  const weights = new Float64Array(text.length);
  scanWeights(text, weights);
  const prefix = new Float64Array(text.length + 1);
  for (let i = 0; i < weights.length; i++) prefix[i + 1] = prefix[i]! + weights[i]!;
  return prefix;
}

export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction === 0.5) return floor % 2 === 0 ? floor : floor + 1;
  return fraction < 0.5 ? floor : floor + 1;
}

export function bisectLeft(sorted: ArrayLike<number>, target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
