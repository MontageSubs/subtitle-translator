import { DAY_MS, type Settings } from "../../config/settings";
import type { ReputationRow } from "./store";

const CLEARED_RATE_LIMIT_MULTIPLIER = 20;
const RETENTION_DAYS = 40;

export interface Gate {
  blocked: boolean;
  quarantined: boolean;
  requireClearance: boolean;
  degraded: boolean;
  clearanceMultiplier: number;
}

export const FAIL_CLOSED_GATE: Gate = { blocked: true, quarantined: false, requireClearance: true, degraded: true, clearanceMultiplier: 1 };

export const dayBucket = (timestamp: number): number => Math.floor(timestamp / DAY_MS);

export const windowBucket = (settings: Settings, timestamp: number): number => Math.floor(timestamp / settings.abuseWindowMs);

export const retentionCutoff = (now: number): number => now - RETENTION_DAYS * DAY_MS;

export function nextEscalationDays(settings: Settings, previousDays: number): number {
  return previousDays > 0 ? Math.min(previousDays * 2, settings.quarantineMaxDays) : settings.quarantineBaseDays;
}

export function todaysCaptchaCount(row: ReputationRow | null, now: number): number {
  return row && row.day_bucket === dayBucket(now) ? row.captcha_count : 0;
}

export function evaluateGate(settings: Settings, row: ReputationRow | null, now: number): Gate {
  const clearanceMultiplier = Math.max(1, Math.floor(CLEARED_RATE_LIMIT_MULTIPLIER / Math.max(1, todaysCaptchaCount(row, now))));
  const base = { degraded: false, clearanceMultiplier };
  if (row && row.blocked_until > now) return { ...base, blocked: true, quarantined: true, requireClearance: true };
  if (row && row.quarantine_until > now) return { ...base, blocked: false, quarantined: true, requireClearance: true };
  const malformedInWindow = row && row.window_bucket === windowBucket(settings, now) ? row.malformed_count : 0;
  return { ...base, blocked: false, quarantined: false, requireClearance: malformedInWindow > settings.malformedThreshold };
}
