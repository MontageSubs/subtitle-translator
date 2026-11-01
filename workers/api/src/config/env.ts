export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ALLOWED_ORIGINS: string;
  SERVICE_URL?: string;
  FALLBACK_URL?: string;
  PROVIDER: string;
  PROVIDER_LIMITS?: string;
  MAX_BATCH_CHARS: string;
  MAX_CONTENT_CHARS: string;
  MAX_BODY_BYTES: string;
  RATE_LIMIT_UNIT_CHARS: string;
  RATE_DEGRADED_DIVISOR: string;
  RATE_PLAIN_DIVISOR: string;
  CLEARED_MULTIPLIER: string;
  RISKY_ASNS?: string;
  QUARANTINE_BASE_DAYS: string;
  QUARANTINE_MAX_DAYS: string;
  DAILY_CAPTCHA_CAP: string;
  BLOCK_DURATION_DAYS: string;
  MALFORMED_THRESHOLD: string;
  ABUSE_WINDOW_MINUTES: string;
  GLOBAL_DAILY_BUDGET: string;
  RETENTION_DAYS: string;
  SESSION_STANDBY_SECONDS: string;
  SESSION_ACTIVE_SECONDS: string;
  CLEARANCE_SECONDS: string;
  RETRY_TOKEN_SECONDS: string;
  OUTPUT_GUARD: string;
  STREAM_LOG: string;
  DEBUG?: string;
  SECRET_A: string;
  SECRET_B: string;
  SALT_KEYRING: string;
  SALT_IPHASH: string;
  TURSO_URL: string;
  TURSO_TOKEN: string;
  TURNSTILE_SECRET: string;
  KEY_GOOGLE: string;
  KEY_GOOGLE_V2?: string;
  KEY_DEEPL?: string;
  BURST_LIMITER: RateLimiter;
  RATE_LIMITER: RateLimiter;
  SESSION_LIMITER: RateLimiter;
  DB: D1Database;
}
