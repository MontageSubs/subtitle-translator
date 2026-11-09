import type { Env } from "../config/env";
import { settingsFor } from "../config/settings";

const PRIMARY_KEY = "endpoint_primary";
const FALLBACK_KEY = "endpoint_fallback";

const SELECT_SQL = "SELECT key, value FROM system_config WHERE key IN (?1, ?2)";
const UPSERT_SQL = "INSERT INTO system_config (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at";
const DELETE_SQL = "DELETE FROM system_config WHERE key = ?1";

export async function syncServiceEndpoints(env: Env, now: number = Date.now()): Promise<number> {
  const { serviceUrl, fallbackUrl } = settingsFor(env);
  const { results } = await env.DB.prepare(SELECT_SQL).bind(PRIMARY_KEY, FALLBACK_KEY).all<{ key: string; value: string }>();
  const stored = new Map(results.map(({ key, value }) => [key, value]));
  const statements: D1PreparedStatement[] = [];
  for (const [key, wanted] of [[PRIMARY_KEY, serviceUrl], [FALLBACK_KEY, fallbackUrl]] as const) {
    if (wanted && stored.get(key) !== wanted) statements.push(env.DB.prepare(UPSERT_SQL).bind(key, wanted, now));
    else if (!wanted && stored.has(key)) statements.push(env.DB.prepare(DELETE_SQL).bind(key));
  }
  if (statements.length) await env.DB.batch(statements);
  return statements.length;
}
