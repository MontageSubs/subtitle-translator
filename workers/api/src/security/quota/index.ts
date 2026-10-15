import { chargeQuota, QUOTA_TTL_SECONDS, type QuotaUsage, type QuotaVerdict } from "./policy";

export { quotaHint, quotaResetAt, type QuotaHint, type QuotaVerdict } from "./policy";

export interface QuotaOutcome {
  verdict: QuotaVerdict;
  usage: QuotaUsage;
}

interface QuotaRequest {
  ipHash: string;
  chars: number;
  cleared: boolean;
  enforce: boolean;
  now: number;
}

const usageKey = (ipHash: string): string => `https://quota.internal/usage/${ipHash}`;

async function loadUsage(cache: Cache, key: string): Promise<QuotaUsage> {
  try {
    const cached = await cache.match(key);
    return cached ? await cached.json<QuotaUsage>() : [];
  } catch {
    return [];
  }
}

const persistUsage = (cache: Cache, key: string, usage: QuotaUsage): Promise<void> =>
  cache.put(key, new Response(JSON.stringify(usage), { headers: { "Cache-Control": `public, max-age=${QUOTA_TTL_SECONDS}` } })).catch(() => undefined);

export async function consumeQuota(cache: Cache, ctx: ExecutionContext, { ipHash, chars, cleared, enforce, now }: QuotaRequest): Promise<QuotaOutcome> {
  const key = usageKey(ipHash);
  const { verdict, usage } = chargeQuota(await loadUsage(cache, key), chars, cleared, now);
  if (enforce && verdict !== "ok") return { verdict, usage };
  ctx.waitUntil(persistUsage(cache, key, usage));
  return { verdict: "ok", usage };
}
