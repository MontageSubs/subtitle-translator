const TOKEN_KEY = "pa_session_token";

export const readPaSessionToken = async (db: D1Database): Promise<string | null> =>
  (await db.prepare("SELECT value FROM system_config WHERE key = ?1").bind(TOKEN_KEY).first<{ value: string }>())?.value || null;
