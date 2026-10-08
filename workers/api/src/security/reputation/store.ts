export interface ReputationRow {
  quarantine_until: number;
  quarantine_days: number;
  blocked_until: number;
  day_bucket: number;
  captcha_count: number;
  window_bucket: number;
  malformed_count: number;
}

export function loadReputation(db: D1Database, ipHash: string): Promise<ReputationRow | null> {
  return db
    .prepare("SELECT quarantine_until, quarantine_days, blocked_until, day_bucket, captcha_count, window_bucket, malformed_count FROM ip_shield WHERE ip_hash = ?")
    .bind(ipHash)
    .first<ReputationRow>();
}

export async function saveQuarantine(db: D1Database, ipHash: string, until: number, days: number, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ip_shield (ip_hash, quarantine_until, quarantine_days, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(ip_hash) DO UPDATE SET quarantine_until = ?2, quarantine_days = ?3, updated_at = ?4`
    )
    .bind(ipHash, until, days, now)
    .run();
}

export async function bumpMalformedCount(db: D1Database, ipHash: string, windowBucket: number, now: number): Promise<number | null> {
  const row = await db
    .prepare(
      `INSERT INTO ip_shield (ip_hash, window_bucket, malformed_count, updated_at)
       VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(ip_hash) DO UPDATE SET
         malformed_count = CASE WHEN window_bucket = ?2 THEN malformed_count + 1 ELSE 1 END,
         window_bucket = ?2, updated_at = ?3
       RETURNING malformed_count`
    )
    .bind(ipHash, windowBucket, now)
    .first<{ malformed_count: number }>();
  return row?.malformed_count ?? null;
}

export async function saveCaptchaCount(db: D1Database, ipHash: string, dayBucket: number, count: number, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ip_shield (ip_hash, day_bucket, captcha_count, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(ip_hash) DO UPDATE SET day_bucket = ?2, captcha_count = ?3, updated_at = ?4`
    )
    .bind(ipHash, dayBucket, count, now)
    .run();
}

export async function saveCaptchaBlock(
  db: D1Database, ipHash: string, dayBucket: number, quarantineDays: number, quarantineUntil: number, blockedUntil: number, now: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ip_shield (ip_hash, day_bucket, captcha_count, quarantine_days, quarantine_until, blocked_until, updated_at)
       VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6)
       ON CONFLICT(ip_hash) DO UPDATE SET day_bucket = ?2, captcha_count = 0, quarantine_days = ?3, quarantine_until = ?4, blocked_until = ?5, updated_at = ?6`
    )
    .bind(ipHash, dayBucket, quarantineDays, quarantineUntil, blockedUntil, now)
    .run();
}

export async function consumeDailyBudget(db: D1Database, dayBucket: number, cap: number): Promise<boolean> {
  const updated = await db
    .prepare(
      `UPDATE global_budget SET
         used = CASE WHEN day_bucket = ?1 THEN used + 1 ELSE 1 END,
         day_bucket = ?1
       WHERE id = 1 AND (day_bucket != ?1 OR used < ?2)
       RETURNING used`
    )
    .bind(dayBucket, cap)
    .first<{ used: number }>();
  if (updated) return true;
  const inserted = await db.prepare("INSERT OR IGNORE INTO global_budget (id, day_bucket, used) VALUES (1, ?1, 1)").bind(dayBucket).run();
  return inserted.meta.changes > 0;
}

export async function deleteStaleReputation(db: D1Database, olderThan: number): Promise<number> {
  const result = await db.prepare("DELETE FROM ip_shield WHERE updated_at < ?").bind(olderThan).run();
  return result.meta.changes || 0;
}
