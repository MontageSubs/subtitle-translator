import type { Env } from "../../config/env";
import { DAY_MS, settingsFor } from "../../config/settings";
import {
  bumpMalformedCount, consumeDailyBudget, deleteStaleReputation, loadReputation, saveCaptchaBlock, saveCaptchaCount, saveQuarantine,
} from "./store";
import { dayBucket, evaluateGate, nextEscalationDays, retentionCutoff, todaysCaptchaCount, windowBucket, type Gate } from "./policy";

export type { Gate } from "./policy";
export { FAIL_CLOSED_GATE } from "./policy";

export async function checkGate(env: Env, ipHash: string, now: number): Promise<Gate> {
  return evaluateGate(settingsFor(env), await loadReputation(env.DB, ipHash), now);
}

export async function escalateQuarantine(env: Env, ipHash: string, now: number): Promise<void> {
  const row = await loadReputation(env.DB, ipHash);
  if (row && row.quarantine_until > now) return;
  const days = nextEscalationDays(settingsFor(env), row?.quarantine_days || 0);
  await saveQuarantine(env.DB, ipHash, now + days * DAY_MS, days, now);
}

export async function recordMalformedRequest(env: Env, ipHash: string, now: number): Promise<boolean> {
  const settings = settingsFor(env);
  const count = await bumpMalformedCount(env.DB, ipHash, windowBucket(settings, now), now);
  if (count !== settings.malformedThreshold + 1) return false;
  await escalateQuarantine(env, ipHash, now);
  return true;
}

export async function recordCaptchaSolved(env: Env, ipHash: string, now: number): Promise<boolean> {
  const settings = settingsFor(env);
  const row = await loadReputation(env.DB, ipHash);
  const bucket = dayBucket(now);
  const count = todaysCaptchaCount(row, now) + 1;
  if (count <= settings.dailyCaptchaCap) {
    await saveCaptchaCount(env.DB, ipHash, bucket, count, now);
    return false;
  }
  const days = nextEscalationDays(settings, row?.quarantine_days || 0);
  await saveCaptchaBlock(env.DB, ipHash, bucket, days, now + days * DAY_MS, now + settings.blockDurationMs, now);
  return true;
}

export async function consumeGlobalBudget(env: Env, now: number): Promise<boolean> {
  const cap = settingsFor(env).globalDailyBudget;
  return !Number.isFinite(cap) || cap >= Number.MAX_SAFE_INTEGER || consumeDailyBudget(env.DB, dayBucket(now), cap);
}

export const pruneReputation = (env: Env, now: number = Date.now()): Promise<number> => deleteStaleReputation(env.DB, retentionCutoff(now));
