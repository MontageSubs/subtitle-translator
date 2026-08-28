import { hmacHex, timingSafeEqual } from "./crypto";

const RETRY_MARKER = "retry";

function buildRetryKey(correlationId: string, ip: string): string {
  return `https://retry.internal/${RETRY_MARKER}/${correlationId}/${ip}`;
}

export async function storeRetryTokenInCache(cache: Cache, correlationId: string, ip: string, secret: string, ttlSeconds: number): Promise<void> {
  const key = buildRetryKey(correlationId, ip);
  const signature = await hmacHex(secret, key);
  await cache.put(key, new Response(signature, { headers: { "Cache-Control": `public, max-age=${ttlSeconds}` } }));
}

export async function consumeRetryTokenOnce(cache: Cache, correlationId: string, ip: string, secret: string): Promise<boolean> {
  const key = buildRetryKey(correlationId, ip);
  const cached = await cache.match(key);
  if (!cached) return false;

  const expectedSignature = await hmacHex(secret, key);
  const storedSignature = await cached.text();

  if (!timingSafeEqual(expectedSignature, storedSignature)) return false;

  await cache.delete(key);
  return true;
}