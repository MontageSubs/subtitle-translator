export async function consumeRetryTokenOnce(db: D1Database, correlationId: string, now: number, guardTtlMs: number): Promise<boolean> {
  try {
    await db.prepare("INSERT INTO retry_token_guard (correlation_id, expires_at) VALUES (?, ?)").bind(correlationId, now + guardTtlMs).run();
    return true;
  } catch {
    return false;
  }
}

export async function pruneRetryTokenGuard(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM retry_token_guard WHERE expires_at < ?").bind(Date.now()).run();
}
