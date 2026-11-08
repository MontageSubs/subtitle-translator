import type { Env } from "./env";
import { getOrInsert } from "../support/getOrInsert";

export const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

export class ConfigError extends Error {
  constructor(readonly variable: string) {
    super(`missing_or_invalid_${variable}`);
    this.name = "ConfigError";
  }
}

export interface ProviderLimitOverride {
  maxBatchChars?: number;
  subrequestLimit?: number;
}

export interface Settings {
  allowedOrigins: ReadonlySet<string> | "*";
  serviceUrl: string;
  fallbackUrl: string;
  maxBatchChars: number;
  maxContentChars: number;
  maxBodyBytes: number;
  providerLimits: Readonly<Record<string, ProviderLimitOverride>>;
  riskyAsns: ReadonlySet<number>;
  blockedUserAgents: readonly string[];
  rateLimitUnitChars: number;
  rateDegradedDivisor: number;
  ratePlainDivisor: number;
  clearedMultiplier: number;
  retentionDays: number;
  standbyTtlMs: number;
  activeTtlMs: number;
  clearanceTtlMs: number;
  retryTokenTtlMs: number;
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

type NamedString = { [K in keyof Env]-?: Env[K] extends string ? K : never }[keyof Env];

function text(env: Env, name: NamedString): string {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") throw new ConfigError(name);
  return value.trim();
}

function positive(env: Env, name: NamedString): number {
  const value = Number(text(env, name));
  if (!Number.isFinite(value) || value <= 0) throw new ConfigError(name);
  return value;
}

const toggle = (env: Env, name: NamedString): boolean => /^(1|true|on)$/i.test(text(env, name));

function parseAllowedOrigins(raw: string): Settings["allowedOrigins"] {
  if (raw === "*") return "*";
  return new Set(raw.split(",").map((origin) => origin.trim()).filter(Boolean));
}

const trimTrailingSlashes = (url: string | undefined): string => (url || "").trim().replace(/\/+$/, "");

function parseRiskyAsns(raw: string | undefined): ReadonlySet<number> {
  if (!raw) return new Set();
  return new Set(raw.split(",").map((value) => Number(value.trim())).filter(Number.isFinite));
}

const MAX_BLOCKED_USER_AGENTS = 256;

function parseBlockedUserAgents(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw.split(/[\n,]/).map((token) => token.trim().toLowerCase()).filter(Boolean).slice(0, MAX_BLOCKED_USER_AGENTS);
}

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

function parseProviderLimits(raw: string | undefined): Settings["providerLimits"] {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([provider, limits]) => {
        const { maxBatchChars, subrequestLimit } = (limits ?? {}) as Record<string, unknown>;
        return [provider, { maxBatchChars: positiveInteger(maxBatchChars), subrequestLimit: positiveInteger(subrequestLimit) }];
      })
    );
  } catch {
    return {};
  }
}

function load(env: Env): Settings {
  return {
    allowedOrigins: parseAllowedOrigins(text(env, "CORS_ORIGINS")),
    serviceUrl: trimTrailingSlashes(env.ENDPOINT_PRIMARY),
    fallbackUrl: trimTrailingSlashes(env.ENDPOINT_FALLBACK),
    maxBatchChars: positive(env, "LIMIT_BATCH_CHARS"),
    maxContentChars: positive(env, "LIMIT_CONTENT_CHARS"),
    maxBodyBytes: positive(env, "LIMIT_BODY_BYTES"),
    providerLimits: parseProviderLimits(env.PROVIDER_LIMITS),
    riskyAsns: parseRiskyAsns(env.ABUSE_RISKY_ASNS),
    blockedUserAgents: parseBlockedUserAgents(env.UA_BLOCKLIST),
    rateLimitUnitChars: positive(env, "LIMIT_UNIT_CHARS"),
    rateDegradedDivisor: positive(env, "RATE_DEGRADED_DIVISOR"),
    ratePlainDivisor: positive(env, "RATE_PLAIN_DIVISOR"),
    clearedMultiplier: positive(env, "RATE_CLEARED_MULTIPLIER"),
    retentionDays: positive(env, "ABUSE_RETENTION_DAYS"),
    standbyTtlMs: positive(env, "SESSION_STANDBY_SECONDS") * SECOND_MS,
    activeTtlMs: positive(env, "SESSION_ACTIVE_SECONDS") * SECOND_MS,
    clearanceTtlMs: positive(env, "SESSION_CLEARANCE_SECONDS") * SECOND_MS,
    retryTokenTtlMs: positive(env, "SESSION_RETRY_SECONDS") * SECOND_MS,
    quarantineBaseDays: positive(env, "ABUSE_QUARANTINE_BASE_DAYS"),
    quarantineMaxDays: positive(env, "ABUSE_QUARANTINE_MAX_DAYS"),
    dailyCaptchaCap: positive(env, "ABUSE_CAPTCHA_DAILY_CAP"),
    blockDurationMs: positive(env, "ABUSE_BLOCK_DAYS") * DAY_MS,
    malformedThreshold: positive(env, "ABUSE_MALFORMED_THRESHOLD"),
    abuseWindowMs: positive(env, "ABUSE_WINDOW_MINUTES") * MINUTE_MS,
    globalDailyBudget: positive(env, "ABUSE_GLOBAL_DAILY_BUDGET"),
    outputGuard: toggle(env, "ABUSE_OUTPUT_GUARD"),
    streamLog: toggle(env, "LOG_STREAM"),
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
