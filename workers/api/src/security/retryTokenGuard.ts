import { hmacHex } from "./crypto";

const RETRY_MARKER = "retry-tombstone";

function buildTombstoneKey(correlationId: string, ip: string): string {
  return `https://retry.internal/${RETRY_MARKER}/${correlationId}/${ip}`;
}

export async function markRetryTokenConsumed(cache: Cache, correlationId: string, ip: string, secret: string, ttlSeconds: number): Promise<boolean> {
  const key = buildTombstoneKey(correlationId, ip);
  try {
    const existing = await cache.match(key);
    if (existing) return false;

    const signature = await hmacHex(secret, key);
    await cache.put(key, new Response(signature, { headers: { "Cache-Control": `public, max-age=${ttlSeconds}` } }));
    return true;
  } catch {
    return false;
  }
}