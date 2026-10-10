const TOKEN_KEY = "pa_session_token";

export const readPaSessionToken = async (db: D1Database): Promise<string | null> =>
  (await db.prepare("SELECT value FROM system_config WHERE key = ?1").bind(TOKEN_KEY).first<{ value: string }>())?.value || null;

export const writePaSessionToken = (db: D1Database, token: string): Promise<unknown> =>
  db
    .prepare("INSERT INTO system_config (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(TOKEN_KEY, token, Date.now())
    .run();
