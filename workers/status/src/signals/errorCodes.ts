import { WindowMetrics } from "../types";

export type ErrorCategory = "client_fault" | "gateway" | "storage_blocking" | "storage_degrading" | "upstream";

const CLIENT_FAULT_CODES: ReadonlySet<number> = new Set([1004]);
const STORAGE_BLOCKING_CODES: ReadonlySet<number> = new Set([2001, 2002]);
const STORAGE_DEGRADING_CODES: ReadonlySet<number> = new Set([2003, 2004]);

export const ERROR_CATEGORIES_BY_COMPONENT: Readonly<Record<string, readonly ErrorCategory[]>> = {
  core_infrastructure: ["gateway", "storage_blocking"],
  service_availability: ["gateway", "storage_blocking"],
  upstream_storage: ["storage_blocking", "storage_degrading"],
  upstream_cloudflare: ["gateway"],
};

export function categorizeErrorCode(code: number): ErrorCategory | null {
  if (CLIENT_FAULT_CODES.has(code)) return "client_fault";
  if (STORAGE_BLOCKING_CODES.has(code)) return "storage_blocking";
  if (STORAGE_DEGRADING_CODES.has(code)) return "storage_degrading";
  if (code >= 1000 && code < 3000) return "gateway";
  if (code >= 3000 && code < 6000) return "upstream";
  return null;
}

export function countErrors(metrics: WindowMetrics, ...categories: ErrorCategory[]): number {
  let total = 0;
  for (const [code, count] of metrics.errorsByCode) {
    const category = categorizeErrorCode(code);
    if (category && categories.includes(category)) total += count;
  }
  return total;
}

export const countServedRequests = (metrics: WindowMetrics): number =>
  metrics.totalJobs + metrics.totalErrors - countErrors(metrics, "client_fault");

export function computeServedAvailability(metrics: WindowMetrics): number {
  const served = countServedRequests(metrics);
  const failures = countErrors(metrics, "gateway", "storage_blocking");
  return served > 0 ? parseFloat((100 * (1 - failures / served)).toFixed(2)) : 100;
}
