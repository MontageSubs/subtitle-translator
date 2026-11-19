import { DAY_MS } from "../config/settings";
import { cacheEntry } from "../support/cacheEntry";

const HOUR_MS = 3_600_000;
const MAX_HINT_PERCENT = 99;

export type QuotaVerdict = "ok" | "verify" | "block";

interface QuotaLimit {
  requests: number;
  chars: number;
}

interface QuotaWindow {
  name: "hour" | "day";
  durationMs: number;
  soft: QuotaLimit;
  hard: QuotaLimit;
}

type WindowUsage = readonly [bucket: number, requests: number, chars: number];
export type QuotaUsage = readonly WindowUsage[];

export interface QuotaHint {
  window: QuotaWindow["name"];
  percent: number;
}

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

const QUOTA_WINDOWS: readonly QuotaWindow[] = [
  { name: "hour", durationMs: HOUR_MS, soft: { requests: 120, chars: 24_000_000 }, hard: { requests: 300, chars: 60_000_000 } },
  { name: "day", durationMs: DAY_MS, soft: { requests: 600, chars: 120_000_000 }, hard: { requests: 1_500, chars: 300_000_000 } },
];

const QUOTA_TTL_SECONDS = Math.max(...QUOTA_WINDOWS.map((window) => window.durationMs)) / 1000;

const usageKey = (ipHash: string): string => `https://quota.internal/usage/${ipHash}`;

const exceeds = ([, requests, chars]: WindowUsage, limit: QuotaLimit): boolean => requests > limit.requests || chars > limit.chars;

function project(previous: QuotaUsage, chars: number, now: number): WindowUsage[] {
  return QUOTA_WINDOWS.map(({ durationMs }, index): WindowUsage => {
    const bucket = Math.floor(now / durationMs);
    const [stored, requests, used] = previous[index] ?? [-1, 0, 0];
    return stored === bucket ? [bucket, requests + 1, used + chars] : [bucket, 1, chars];
  });
}

function charge(previous: QuotaUsage, chars: number, cleared: boolean, now: number): QuotaOutcome {
  const usage = project(previous, chars, now);
  const over = (tier: "soft" | "hard"): boolean => usage.some((entry, index) => exceeds(entry, QUOTA_WINDOWS[index]![tier]));
  return { verdict: over("hard") ? "block" : !cleared && over("soft") ? "verify" : "ok", usage };
}

async function loadUsage(cache: Cache, key: string): Promise<QuotaUsage> {
  try {
    const cached = await cache.match(key);
    return cached ? await cached.json<QuotaUsage>() : [];
  } catch {
    return [];
  }
}

export async function consumeQuota(ctx: ExecutionContext, { ipHash, chars, cleared, enforce, now }: QuotaRequest): Promise<QuotaOutcome> {
  const cache = caches.default;
  const key = usageKey(ipHash);
  const { verdict, usage } = charge(await loadUsage(cache, key), chars, cleared, now);
  if (enforce && verdict !== "ok") return { verdict, usage };
  ctx.waitUntil(cache.put(key, cacheEntry(JSON.stringify(usage), QUOTA_TTL_SECONDS)).catch(() => undefined));
  return { verdict: "ok", usage };
}

export function quotaHint(usage: QuotaUsage): QuotaHint {
  let hint: QuotaHint = { window: QUOTA_WINDOWS[0]!.name, percent: 0 };
  usage.forEach(([, requests, chars], index) => {
    const { name, hard } = QUOTA_WINDOWS[index]!;
    const percent = Math.min(MAX_HINT_PERCENT, Math.round(Math.max(requests / hard.requests, chars / hard.chars) * 100));
    if (percent >= hint.percent) hint = { window: name, percent };
  });
  return hint;
}

export function quotaResetAt(usage: QuotaUsage): number {
  return usage.reduce((latest, entry, index) => {
    const { durationMs, hard } = QUOTA_WINDOWS[index]!;
    return exceeds(entry, hard) ? Math.max(latest, (entry[0] + 1) * durationMs) : latest;
  }, 0);
}
