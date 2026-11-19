import type { ReputationRow } from "./policy";

export type ShieldColumn = keyof ReputationRow;

const MALFORMED_ACCUMULATION =
  "malformed_count = CASE WHEN window_bucket = excluded.window_bucket THEN malformed_count + excluded.malformed_count ELSE excluded.malformed_count END";

export const selectReputation = (db: D1Database, ipHash: string): D1PreparedStatement =>
  db
    .prepare("SELECT quarantine_until, quarantine_days, blocked_until, day_bucket, captcha_count, window_bucket, malformed_count FROM ip_shield WHERE ip_hash = ?")
    .bind(ipHash);

export const selectBudget = (db: D1Database): D1PreparedStatement => db.prepare("SELECT day_bucket, used FROM global_budget WHERE id = 1");

export const selectSeal = (db: D1Database, version: string): D1PreparedStatement => db.prepare("SELECT seal FROM client_seals WHERE version = ?").bind(version);

export function upsertReputation(db: D1Database, ipHash: string, now: number, values: Partial<Record<ShieldColumn, number>>): D1PreparedStatement {
  const columns = Object.keys(values);
  const assignments = columns.map((column) => (column === "malformed_count" ? MALFORMED_ACCUMULATION : `${column} = excluded.${column}`));
  return db
    .prepare(
      `INSERT INTO ip_shield (ip_hash, updated_at, ${columns.join(", ")}) VALUES (?, ?, ${columns.map(() => "?").join(", ")})
       ON CONFLICT(ip_hash) DO UPDATE SET updated_at = excluded.updated_at, ${assignments.join(", ")}`
    )
    .bind(ipHash, now, ...Object.values(values));
}

export const chargeBudget = (db: D1Database, dayBucket: number): D1PreparedStatement =>
  db
    .prepare(
      `INSERT INTO global_budget (id, day_bucket, used) VALUES (1, ?1, 1)
       ON CONFLICT(id) DO UPDATE SET used = CASE WHEN day_bucket = ?1 THEN used + 1 ELSE 1 END, day_bucket = ?1`
    )
    .bind(dayBucket);

export const insertSeal = (db: D1Database, version: string, seal: string): D1PreparedStatement =>
  db.prepare("INSERT OR IGNORE INTO client_seals (version, seal) VALUES (?1, ?2)").bind(version, seal);

