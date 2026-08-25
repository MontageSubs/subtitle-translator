import { Env, quarantineBaseDays, quarantineMaxDays, dailyFreeQuota, dailyCaptchaCap, blockDurationMs, malformedThreshold, handshakeAbuseThreshold, abuseWindowMs } from "./env";

export interface Gate {
  blocked: boolean;
  quarantined: boolean;
  requireClearance: boolean;
  degraded: boolean;
  clearanceMultiplier: number;
}

interface ReputationRow {
  quarantine_until: number;
  quarantine_days: number;
  blocked_until: number;
  day_bucket: number;
  free_used: number;
  captcha_count: number;
  window_bucket: number;
  malformed_count: number;
  handshake_count: number;
  completed_count: number;
}

const DAY_MS = 86_400_000;
const CLEARED_RATE_LIMIT_MULTIPLIER = 20;

function dayBucket(ts: number): number {
  return Math.floor(ts / DAY_MS);
}

function windowBucket(env: Env, ts: number): number {
  return Math.floor(ts / abuseWindowMs(env));
}

function nextEscalationDays(env: Env, previousDays: number): number {
  return previousDays > 0 ? Math.min(previousDays * 2, quarantineMaxDays(env)) : quarantineBaseDays(env);
}

function todaysCount(row: ReputationRow | null, now: number, field: "captcha_count" | "free_used"): number {
  return row && row.day_bucket === dayBucket(now) ? row[field] : 0;
}

function windowCount(env: Env, row: ReputationRow | null, now: number, field: "malformed_count" | "handshake_count" | "completed_count"): number {
  return row && row.window_bucket === windowBucket(env, now) ? row[field] : 0;
}

async function loadRow(db: D1Database, ipHash: string): Promise<ReputationRow | null> {
  return db.prepare(
    "SELECT quarantine_until, quarantine_days, blocked_until, day_bucket, free_used, captcha_count, window_bucket, malformed_count, handshake_count, completed_count FROM ip_shield WHERE ip_hash = ?"
  ).bind(ipHash).first<ReputationRow>();
}

export async function checkGate(env: Env, db: D1Database, ipHash: string, now: number): Promise<Gate> {
  const row = await loadRow(db, ipHash);
  const captchaCount = todaysCount(row, now, "captcha_count");
  const clearanceMultiplier = Math.max(1, Math.floor(CLEARED_RATE_LIMIT_MULTIPLIER / Math.max(1, captchaCount)));

  if (row && row.blocked_until > now) return { blocked: true, quarantined: true, requireClearance: true, degraded: false, clearanceMultiplier };

  const handshakeAbuse = windowCount(env, row, now, "handshake_count") > handshakeAbuseThreshold(env) && windowCount(env, row, now, "completed_count") === 0;
  const malformedAbuse = windowCount(env, row, now, "malformed_count") > malformedThreshold(env);

  if (row && row.quarantine_until > now) {
    const used = todaysCount(row, now, "free_used");
    return { blocked: false, quarantined: true, requireClearance: used >= dailyFreeQuota(env), degraded: false, clearanceMultiplier };
  }

  return { blocked: false, quarantined: false, requireClearance: handshakeAbuse || malformedAbuse, degraded: false, clearanceMultiplier };
}

export async function consumeFreeQuota(db: D1Database, ipHash: string, now: number): Promise<void> {
  await db.prepare(
    `UPDATE ip_shield SET
       free_used = CASE WHEN day_bucket = ?2 THEN free_used + 1 ELSE 1 END,
       day_bucket = ?2,
       updated_at = ?3
     WHERE ip_hash = ?1`
  ).bind(ipHash, dayBucket(now), now).run();
}

export async function escalateQuarantine(env: Env, db: D1Database, ipHash: string, now: number): Promise<void> {
  const row = await loadRow(db, ipHash);
  if (row && row.quarantine_until > now) return;
  const quarantineDays = nextEscalationDays(env, row?.quarantine_days || 0);
  const quarantineUntil = now + quarantineDays * DAY_MS;
  await db.prepare(
    `INSERT INTO ip_shield (ip_hash, quarantine_until, quarantine_days, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(ip_hash) DO UPDATE SET quarantine_until = ?2, quarantine_days = ?3, updated_at = ?4`
  ).bind(ipHash, quarantineUntil, quarantineDays, now).run();
}

export async function recordMalformedRequest(env: Env, db: D1Database, ipHash: string, now: number): Promise<boolean> {
  const row = await loadRow(db, ipHash);
  const bucket = windowBucket(env, now);
  const count = windowCount(env, row, now, "malformed_count") + 1;
  const result = await db.prepare(
    `UPDATE ip_shield SET
       malformed_count = CASE WHEN window_bucket = ?2 THEN malformed_count + 1 ELSE 1 END,
       window_bucket = ?2, updated_at = ?3
     WHERE ip_hash = ?1`
  ).bind(ipHash, bucket, now).run();
  if (result.meta.changes === 0) return false;
  if (count <= malformedThreshold(env)) return false;
  await escalateQuarantine(env, db, ipHash, now);
  return true;
}

export async function recordHandshake(env: Env, db: D1Database, ipHash: string, now: number): Promise<void> {
  const bucket = windowBucket(env, now);
  await db.prepare(
    `UPDATE ip_shield SET
       handshake_count = CASE WHEN window_bucket = ?2 THEN handshake_count + 1 ELSE 1 END,
       completed_count = CASE WHEN window_bucket = ?2 THEN completed_count ELSE 0 END,
       window_bucket = ?2, updated_at = ?3
     WHERE ip_hash = ?1`
  ).bind(ipHash, bucket, now).run();
}

export async function recordCompletedJob(env: Env, db: D1Database, ipHash: string, now: number): Promise<void> {
  const bucket = windowBucket(env, now);
  await db.prepare(
    `UPDATE ip_shield SET
       completed_count = CASE WHEN window_bucket = ?2 THEN completed_count + 1 ELSE 1 END,
       window_bucket = ?2, updated_at = ?3
     WHERE ip_hash = ?1`
  ).bind(ipHash, bucket, now).run();
}

export async function recordCaptchaSolved(env: Env, db: D1Database, ipHash: string, now: number): Promise<boolean> {
  const row = await loadRow(db, ipHash);
  const bucket = dayBucket(now);
  const count = todaysCount(row, now, "captcha_count") + 1;
  const cap = dailyCaptchaCap(env);

  if (count <= cap) {
    await db.prepare(
      `INSERT INTO ip_shield (ip_hash, day_bucket, captcha_count, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(ip_hash) DO UPDATE SET day_bucket = ?2, captcha_count = ?3, updated_at = ?4`
    ).bind(ipHash, bucket, count, now).run();
    return false;
  }

  const quarantineDays = nextEscalationDays(env, row?.quarantine_days || 0);
  const blockedUntil = now + blockDurationMs(env);
  const quarantineUntil = now + quarantineDays * DAY_MS;
  await db.prepare(
    `INSERT INTO ip_shield (ip_hash, day_bucket, captcha_count, quarantine_days, quarantine_until, blocked_until, updated_at)
     VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6)
     ON CONFLICT(ip_hash) DO UPDATE SET day_bucket = ?2, captcha_count = 0, quarantine_days = ?3, quarantine_until = ?4, blocked_until = ?5, updated_at = ?6`
  ).bind(ipHash, bucket, quarantineDays, quarantineUntil, blockedUntil, now).run();
  return true;
}

export async function consumeGlobalBudget(db: D1Database, now: number, cap: number): Promise<boolean> {
  if (!Number.isFinite(cap) || cap >= Number.MAX_SAFE_INTEGER) return true;
  const bucket = dayBucket(now);
  const row = await db.prepare("SELECT day_bucket, used FROM global_budget WHERE id = 1").first<{ day_bucket: number; used: number }>();
  const used = row?.day_bucket === bucket ? row.used : 0;
  if (used >= cap) return false;
  await db.prepare(
    `INSERT INTO global_budget (id, day_bucket, used) VALUES (1, ?1, 1)
     ON CONFLICT(id) DO UPDATE SET
       used = CASE WHEN day_bucket = ?1 THEN used + 1 ELSE 1 END,
       day_bucket = ?1`
  ).bind(bucket).run();
  return true;
}

const REPUTATION_RETENTION_DAYS_MULTIPLIER = 40;

export async function pruneReputation(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM ip_shield WHERE updated_at < ?").bind(Date.now() - REPUTATION_RETENTION_DAYS_MULTIPLIER * DAY_MS).run();
}
