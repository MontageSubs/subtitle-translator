const TOKEN_KEY = "pa_session_token";

let hotToken: string | null = null;
let prefetchedToken: string | null | undefined;

export const cachedPaSessionToken = (): string | null => hotToken;

export const cachePaSessionToken = (token: string): void => {
  hotToken = token;
};

export const selectPaSessionToken = (db: D1Database): D1PreparedStatement => db.prepare("SELECT value FROM system_config WHERE key = ?1").bind(TOKEN_KEY);

export const prefetchPaSessionToken = (row: { value: string } | undefined): void => {
  prefetchedToken = row?.value || null;
};

export async function readPaSessionToken(db: D1Database): Promise<string | null> {
  if (prefetchedToken !== undefined) return prefetchedToken;
  return (await selectPaSessionToken(db).first<{ value: string }>())?.value || null;
}

export const writePaSessionToken = (db: D1Database, token: string): Promise<unknown> =>
  db
    .prepare("INSERT INTO system_config (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(TOKEN_KEY, token, Date.now())
    .run();
