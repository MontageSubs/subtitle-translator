export async function consumeNonceOnce(db: D1Database, nonce: number, now: number, ttlMs: number): Promise<boolean> {
  try {
    await db.prepare("INSERT INTO nonce_guard (nonce, expires_at) VALUES (?, ?)").bind(nonce, now + Math.max(1000, ttlMs)).run();
    return true;
  } catch {
    return false;
  }
}

export async function pruneNonceGuard(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM nonce_guard WHERE expires_at < ?").bind(Date.now()).run();
}
