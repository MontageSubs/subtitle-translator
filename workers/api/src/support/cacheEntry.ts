export const cacheEntry = (body: string, ttlSeconds: number): Response => new Response(body, { headers: { "Cache-Control": `public, max-age=${ttlSeconds}` } });
