import { DAY_MS, type Settings } from "../../config/settings";

export interface ReputationRow {
  quarantine_until: number;
  quarantine_days: number;
  blocked_until: number;
  day_bucket: number;
  captcha_count: number;
  window_bucket: number;
  malformed_count: number;
}

export interface BudgetRow {
  day_bucket: number;
  used: number;
}

export interface Gate {
  blocked: boolean;
  quarantined: boolean;
  requireClearance: boolean;
  degraded: boolean;
  clearanceMultiplier: number;
  blockedUntil: number;
}

export const blankReputation = (): ReputationRow => ({
  quarantine_until: 0, quarantine_days: 0, blocked_until: 0, day_bucket: 0, captcha_count: 0, window_bucket: 0, malformed_count: 0,
});

export const dayBucket = (timestamp: number): number => Math.floor(timestamp / DAY_MS);

export const windowBucket = (settings: Settings, timestamp: number): number => Math.floor(timestamp / settings.abuseWindowMs);

export const isBudgetEnforced = ({ globalDailyBudget }: Settings): boolean => Number.isFinite(globalDailyBudget) && globalDailyBudget < Number.MAX_SAFE_INTEGER;

export const budgetUsedToday = (row: BudgetRow | undefined, now: number): number => (row && row.day_bucket === dayBucket(now) ? row.used : 0);

export function nextEscalationDays(settings: Settings, previousDays: number): number {
  return previousDays > 0 ? Math.min(previousDays * 2, settings.quarantineMaxDays) : settings.quarantineBaseDays;
}

export const todaysCaptchaCount = (row: ReputationRow, now: number): number => (row.day_bucket === dayBucket(now) ? row.captcha_count : 0);

export function evaluateGate(settings: Settings, row: ReputationRow, now: number): Gate {
  const clearanceMultiplier = Math.max(1, Math.floor(settings.clearedMultiplier / Math.max(1, todaysCaptchaCount(row, now))));
  const base = { degraded: false, clearanceMultiplier, blockedUntil: 0 };
  if (row.blocked_until > now) return { ...base, blocked: true, quarantined: true, requireClearance: true, blockedUntil: row.blocked_until };
  if (row.quarantine_until > now) return { ...base, blocked: false, quarantined: true, requireClearance: true };
  const malformedInWindow = row.window_bucket === windowBucket(settings, now) ? row.malformed_count : 0;
  return { ...base, blocked: false, quarantined: false, requireClearance: malformedInWindow > settings.malformedThreshold };
}
