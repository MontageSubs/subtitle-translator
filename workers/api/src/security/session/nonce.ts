import { hmacHex, timingSafeEqual } from "../crypto";

const nonceKey = (nonce: number, ipHash: string): string => `https://nonce.internal/nonce/${nonce}/${ipHash}`;

export async function storeNonce(cache: Cache, nonce: number, ipHash: string, secret: string, ttlSeconds: number): Promise<void> {
  const key = nonceKey(nonce, ipHash);
  await cache.put(key, new Response(await hmacHex(secret, key), { headers: { "Cache-Control": `public, max-age=${ttlSeconds}` } }));
}

export async function consumeNonce(cache: Cache, nonce: number, ipHash: string, secret: string): Promise<boolean> {
  const key = nonceKey(nonce, ipHash);
  const cached = await cache.match(key);
  if (!cached) return false;
  const [expected, stored] = await Promise.all([hmacHex(secret, key), cached.text()]);
  if (!timingSafeEqual(expected, stored)) return false;
  await cache.delete(key);
  return true;
}
