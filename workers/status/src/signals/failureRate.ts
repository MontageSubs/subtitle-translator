import { ComponentStatus } from "../types";

const WILSON_Z = 1.96;

const SEVERITY_LEVELS: ReadonlyArray<{ status: ComponentStatus; minFailures: number; minLowerBound: number }> = [
  { status: "major_outage", minFailures: 5, minLowerBound: 0.5 },
  { status: "degraded_performance", minFailures: 3, minLowerBound: 0.1 },
];

export const MIN_CORROBORATING_FAILURES = 2;

function failureRateLowerBound(failures: number, total: number): number {
  if (failures <= 0 || total <= 0) return 0;
  const n = Math.max(total, failures);
  const rate = failures / n;
  const zSquared = WILSON_Z * WILSON_Z;
  const center = rate + zSquared / (2 * n);
  const margin = WILSON_Z * Math.sqrt((rate * (1 - rate) + zSquared / (4 * n)) / n);
  return Math.max(0, (center - margin) / (1 + zSquared / n));
}

export function assessFailureRate(failures: number, total: number): ComponentStatus {
  const lowerBound = failureRateLowerBound(failures, total);
  return SEVERITY_LEVELS.find((level) => failures >= level.minFailures && lowerBound >= level.minLowerBound)?.status ?? "operational";
}
