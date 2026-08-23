import { TursoConfig } from "./turso";

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ALLOWED_ORIGIN: string;
  WORKER_SECRET: string;
  WORKER_SALT?: string;
  IP_HASH_SALT: string;
  MAX_BATCH_CHARS?: string;
  MAX_CONTENT_CHARS?: string;
  MAX_BODY_BYTES?: string;
  RISKY_ASNS?: string;
  RATE_LIMIT_UNIT_CHARS?: string;
  GOOGLE_TRANSLATE_API_KEY?: string;
  TURSO_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  RATE_LIMITER: RateLimit;
  BURST_LIMITER: RateLimit;
  DB: D1Database;
}

export const STANDBY_TTL_MS = 60_000;
export const ACTIVE_TTL_MS = 20_000;
export const BATCH_CHARS_TOLERANCE = 1.1;

const DEFAULT_MAX_BATCH_CHARS = 60_000;
const DEFAULT_MAX_CONTENT_CHARS = 200_000;
const DEFAULT_MAX_BODY_BYTES = 4_000_000;
const HARD_WALLCLOCK_MS = 15_000;
const RESPONSE_OVERHEAD_MARGIN_MS = 2_000;
const MIN_FANOUT_BUDGET_MS = 3_000;

export function maxBatchChars(env: Env): number {
  return Number(env.MAX_BATCH_CHARS) || DEFAULT_MAX_BATCH_CHARS;
}

export function maxContentChars(env: Env): number {
  return Number(env.MAX_CONTENT_CHARS) || DEFAULT_MAX_CONTENT_CHARS;
}

export function maxBodyBytes(env: Env): number {
  return Number(env.MAX_BODY_BYTES) || DEFAULT_MAX_BODY_BYTES;
}

const DEFAULT_RISKY_ASNS = [14618, 16509, 15169, 396982, 8075, 14061, 24940, 16276, 63949, 20473, 31898, 45102, 132203, 51167];

export function riskyAsnSet(env: Env): Set<number> {
  if (!env.RISKY_ASNS) return new Set(DEFAULT_RISKY_ASNS);
  return new Set(env.RISKY_ASNS.split(",").map((v) => Number(v.trim())).filter(Number.isFinite));
}

export function remainingBudgetMs(startedAt: number): number {
  return Math.max(MIN_FANOUT_BUDGET_MS, HARD_WALLCLOCK_MS - RESPONSE_OVERHEAD_MARGIN_MS - (Date.now() - startedAt));
}

export function tursoConfig(env: Env): TursoConfig | null {
  return env.TURSO_URL && env.TURSO_AUTH_TOKEN ? { url: env.TURSO_URL, authToken: env.TURSO_AUTH_TOKEN } : null;
}
