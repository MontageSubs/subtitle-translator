import type { Env } from "../config/env";
import { DAY_MS, settingsFor } from "../config/settings";
import { versionStanding } from "../http/clientVersion";

const PRIMARY_KEY = "endpoint_primary";
const FALLBACK_KEY = "endpoint_fallback";
const DELETE_CHUNK = 50;

const UPSERT_ENDPOINT_SQL = "INSERT INTO system_config (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at";

export interface MaintenanceReport {
  pruned: number;
  seals: number;
  endpoints: number;
}

export async function runD1Maintenance(env: Env, now: number = Date.now()): Promise<MaintenanceReport> {
  const { DB: db } = env;
  const { serviceUrl, fallbackUrl, retentionDays } = settingsFor(env);
  const [sealRows, endpointRows] = await db.batch<Record<string, string>>([
    db.prepare("SELECT version FROM client_seals"),
    db.prepare("SELECT key, value FROM system_config WHERE key IN (?1, ?2)").bind(PRIMARY_KEY, FALLBACK_KEY),
  ]);
  const staleVersions = sealRows!.results.map(({ version }) => version!).filter((version) => versionStanding(version) !== "supported");
  const storedEndpoints = new Map(endpointRows!.results.map(({ key, value }) => [key!, value!]));

  const endpointStatements: D1PreparedStatement[] = [];
  for (const [key, wanted] of [[PRIMARY_KEY, serviceUrl], [FALLBACK_KEY, fallbackUrl]] as const) {
    if (wanted && storedEndpoints.get(key) !== wanted) endpointStatements.push(db.prepare(UPSERT_ENDPOINT_SQL).bind(key, wanted, now));
    else if (!wanted && storedEndpoints.has(key)) endpointStatements.push(db.prepare("DELETE FROM system_config WHERE key = ?1").bind(key));
  }
  const sealStatements: D1PreparedStatement[] = [];
  for (let offset = 0; offset < staleVersions.length; offset += DELETE_CHUNK) {
    const chunk = staleVersions.slice(offset, offset + DELETE_CHUNK);
    sealStatements.push(db.prepare(`DELETE FROM client_seals WHERE version IN (${chunk.map(() => "?").join(",")})`).bind(...chunk));
  }

  const results = await db.batch([
    db.prepare("DELETE FROM ip_shield WHERE updated_at < ?").bind(now - retentionDays * DAY_MS),
    ...sealStatements,
    ...endpointStatements,
  ]);
  const changes = (from: number, count: number): number => results.slice(from, from + count).reduce((total, result) => total + (result.meta.changes || 0), 0);
  return { pruned: changes(0, 1), seals: changes(1, sealStatements.length), endpoints: endpointStatements.length };
}
