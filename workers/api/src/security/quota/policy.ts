import { DAY_MS } from "../../config/settings";

const HOUR_MS = 3_600_000;

export type QuotaVerdict = "ok" | "verify" | "block";

interface QuotaLimit {
  requests: number;
  chars: number;
}

interface QuotaWindow {
  durationMs: number;
  soft: QuotaLimit;
  hard: QuotaLimit;
}

export type WindowUsage = readonly [bucket: number, requests: number, chars: number];
export type QuotaUsage = readonly WindowUsage[];

export const QUOTA_WINDOWS: readonly QuotaWindow[] = [
  { durationMs: HOUR_MS, soft: { requests: 120, chars: 24_000_000 }, hard: { requests: 300, chars: 60_000_000 } },
  { durationMs: DAY_MS, soft: { requests: 600, chars: 120_000_000 }, hard: { requests: 1_500, chars: 300_000_000 } },
];

export const QUOTA_TTL_SECONDS = Math.max(...QUOTA_WINDOWS.map((window) => window.durationMs)) / 1000;

const exceeds = ([, requests, chars]: WindowUsage, limit: QuotaLimit): boolean => requests > limit.requests || chars > limit.chars;

function project(previous: QuotaUsage, chars: number, now: number): WindowUsage[] {
  return QUOTA_WINDOWS.map(({ durationMs }, index): WindowUsage => {
    const bucket = Math.floor(now / durationMs);
    const [stored, requests, used] = previous[index] ?? [-1, 0, 0];
    return stored === bucket ? [bucket, requests + 1, used + chars] : [bucket, 1, chars];
  });
}

export function chargeQuota(previous: QuotaUsage, chars: number, cleared: boolean, now: number): { verdict: QuotaVerdict; usage: QuotaUsage } {
  const usage = project(previous, chars, now);
  const over = (tier: "soft" | "hard"): boolean => usage.some((entry, index) => exceeds(entry, QUOTA_WINDOWS[index]![tier]));
  const verdict: QuotaVerdict = over("hard") ? "block" : !cleared && over("soft") ? "verify" : "ok";
  return { verdict, usage };
}
