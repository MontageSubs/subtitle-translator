export const HISTORY_MAX_JOBS = 100;
const HISTORY_WARN_JOBS = 90;
export const MAX_SUBTITLES_PER_JOB = 100;

export type HistoryUsageLevel = "ok" | "warn" | "full";

export function historyUsageLevel(count: number): HistoryUsageLevel {
  if (count >= HISTORY_MAX_JOBS) return "full";
  return count >= HISTORY_WARN_JOBS ? "warn" : "ok";
}
