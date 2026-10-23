import type { Env } from "./env";
import { getOrInsert } from "../support/getOrInsert";

export const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const DEFAULT_RISKY_ASNS = [14618, 16509, 15169, 396982, 8075, 14061, 24940, 16276, 63949, 20473, 31898, 45102, 132203, 51167];

export interface Settings {
  allowedOrigins: ReadonlySet<string> | "*";
  serviceUrl: string;
  fallbackUrl: string;
  maxBatchChars: number;
  maxContentChars: number;
  maxBodyBytes: number;
  riskyAsns: ReadonlySet<number>;
  rateLimitUnitChars: number;
  quarantineBaseDays: number;
  quarantineMaxDays: number;
  dailyCaptchaCap: number;
  blockDurationMs: number;
  malformedThreshold: number;
  abuseWindowMs: number;
  globalDailyBudget: number;
  outputGuard: boolean;
  streamLog: boolean;
}

const isEnabled = (value: string | undefined): boolean => /^(1|true|on)$/i.test(value || "");

const numberOr = (value: string | undefined, fallback: number): number => Number(value) || fallback;

function parseAllowedOrigins(raw: string): Settings["allowedOrigins"] {
  if (raw === "*") return "*";
  return new Set(raw.split(",").map((origin) => origin.trim()).filter(Boolean));
}

const trimTrailingSlashes = (url: string | undefined): string => (url || "").trim().replace(/\/+$/, "");

function parseRiskyAsns(raw: string | undefined): ReadonlySet<number> {
  if (!raw) return new Set(DEFAULT_RISKY_ASNS);
  return new Set(raw.split(",").map((value) => Number(value.trim())).filter(Number.isFinite));
}

function load(env: Env): Settings {
  return {
    allowedOrigins: parseAllowedOrigins([env.ALLOWED_ORIGIN, env.FALLBACK_ORIGIN].filter(Boolean).join(",")),
    serviceUrl: trimTrailingSlashes(env.SERVICE_URL),
    fallbackUrl: trimTrailingSlashes(env.FALLBACK_URL),
    maxBatchChars: numberOr(env.MAX_BATCH_CHARS, 60_000),
    maxContentChars: numberOr(env.MAX_CONTENT_CHARS, 200_000),
    maxBodyBytes: numberOr(env.MAX_BODY_BYTES, 4_000_000),
    riskyAsns: parseRiskyAsns(env.RISKY_ASNS),
    rateLimitUnitChars: numberOr(env.RATE_LIMIT_UNIT_CHARS, 500),
    quarantineBaseDays: numberOr(env.QUARANTINE_BASE_DAYS, 1),
    quarantineMaxDays: numberOr(env.QUARANTINE_MAX_DAYS, 40),
    dailyCaptchaCap: numberOr(env.DAILY_CAPTCHA_CAP, 8),
    blockDurationMs: numberOr(env.BLOCK_DURATION_DAYS, 1) * DAY_MS,
    malformedThreshold: numberOr(env.MALFORMED_THRESHOLD, 5),
    abuseWindowMs: numberOr(env.ABUSE_WINDOW_MINUTES, 15) * MINUTE_MS,
    globalDailyBudget: numberOr(env.GLOBAL_DAILY_BUDGET, Number.MAX_SAFE_INTEGER),
    outputGuard: isEnabled(env.OUTPUT_GUARD),
    streamLog: isEnabled(env.STREAM_LOG),
  };
}

const cache = new WeakMap<Env, Settings>();

export function settingsFor(env: Env): Settings {
  return getOrInsert(cache, env, () => load(env));
}

export function isAllowedOrigin(origin: string, env: Env): boolean {
  if (!origin) return false;
  const { allowedOrigins } = settingsFor(env);
  return allowedOrigins === "*" || allowedOrigins.has(origin);
}


