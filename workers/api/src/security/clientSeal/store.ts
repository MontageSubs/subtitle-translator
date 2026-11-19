const DELETE_CHUNK = 50;

export async function loadSeal(db: D1Database, version: string): Promise<string | null> {
  const row = await db.prepare("SELECT seal FROM client_seals WHERE version = ?").bind(version).first<{ seal: string }>();
  return row?.seal ?? null;
}

export async function saveSeal(db: D1Database, version: string, seal: string): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO client_seals (version, seal) VALUES (?1, ?2)").bind(version, seal).run();
}

export async function deleteSeal(db: D1Database, version: string): Promise<void> {
  await db.prepare("DELETE FROM client_seals WHERE version = ?").bind(version).run();
}

export async function listSealVersions(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT version FROM client_seals").all<{ version: string }>();
  return results.map(({ version }) => version);
}

export async function deleteSeals(db: D1Database, versions: readonly string[]): Promise<number> {
  const statements: D1PreparedStatement[] = [];
  for (let offset = 0; offset < versions.length; offset += DELETE_CHUNK) {
    const chunk = versions.slice(offset, offset + DELETE_CHUNK);
    statements.push(db.prepare(`DELETE FROM client_seals WHERE version IN (${chunk.map(() => "?").join(",")})`).bind(...chunk));
  }
  if (!statements.length) return 0;
  const results = await db.batch(statements);
  return results.reduce((total, result) => total + (result.meta.changes || 0), 0);
}
