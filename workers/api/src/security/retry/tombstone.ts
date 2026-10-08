import { hmacHex } from "../crypto";

const tombstoneKey = (correlationId: string, ipHash: string): string => `https://retry.internal/retry-tombstone/${correlationId}/${ipHash}`;

export async function markRetryTokenConsumed(cache: Cache, correlationId: string, ipHash: string, secret: string, ttlSeconds: number): Promise<boolean> {
  const key = tombstoneKey(correlationId, ipHash);
  try {
    if (await cache.match(key)) return false;
    await cache.put(key, new Response(await hmacHex(secret, key), { headers: { "Cache-Control": `public, max-age=${ttlSeconds}` } }));
    return true;
  } catch {
    return false;
  }
}
