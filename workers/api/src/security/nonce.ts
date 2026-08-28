import { hmacHex, timingSafeEqual } from "./crypto";

const NONCE_MARKER = "nonce";

function buildNonceKey(nonce: number, ip: string): string {
  return `https://nonce.internal/${NONCE_MARKER}/${nonce}/${ip}`;
}

export async function storeNonceInCache(cache: Cache, nonce: number, ip: string, secret: string, ttlSeconds: number): Promise<void> {
  const key = buildNonceKey(nonce, ip);
  const signature = await hmacHex(secret, key);
  await cache.put(key, new Response(signature, { headers: { "Cache-Control": `public, max-age=${ttlSeconds}` } }));
}

export async function consumeNonceFromCache(cache: Cache, nonce: number, ip: string, secret: string): Promise<boolean> {
  const key = buildNonceKey(nonce, ip);
  const cached = await cache.match(key);
  if (!cached) return false;
  
  const expectedSignature = await hmacHex(secret, key);
  const storedSignature = await cached.text();
  
  if (!timingSafeEqual(expectedSignature, storedSignature)) return false;
  
  await cache.delete(key);
  return true;
}
