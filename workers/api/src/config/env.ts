export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  CORS_ORIGINS: string;
  ENDPOINT_PRIMARY?: string;
  ENDPOINT_FALLBACK?: string;
  PROVIDER_DEFAULT: string;
  PROVIDER_LIMITS?: string;
  LIMIT_BATCH_CHARS: string;
  LIMIT_CONTENT_CHARS: string;
  LIMIT_BODY_BYTES: string;
  LIMIT_UNIT_CHARS: string;
  RATE_DEGRADED_DIVISOR: string;
  RATE_PLAIN_DIVISOR: string;
  RATE_CLEARED_MULTIPLIER: string;
  ABUSE_RISKY_ASNS?: string;
  UA_BLOCKLIST?: string;
  ABUSE_QUARANTINE_BASE_DAYS: string;
  ABUSE_QUARANTINE_MAX_DAYS: string;
  ABUSE_CAPTCHA_DAILY_CAP: string;
  ABUSE_BLOCK_DAYS: string;
  ABUSE_MALFORMED_THRESHOLD: string;
  ABUSE_WINDOW_MINUTES: string;
  ABUSE_GLOBAL_DAILY_BUDGET: string;
  ABUSE_RETENTION_DAYS: string;
  SESSION_STANDBY_SECONDS: string;
  SESSION_ACTIVE_SECONDS: string;
  SESSION_CLEARANCE_SECONDS: string;
  SESSION_RETRY_SECONDS: string;
  ABUSE_OUTPUT_GUARD: string;
  LOG_STREAM: string;
  LOG_DEBUG?: string;
  SIGNING_SECRET_A: string;
  SIGNING_SECRET_B: string;
  SIGNING_SALT: string;
  PRIVACY_SALT_IP: string;
  TURSO_URL: string;
  TURSO_TOKEN: string;
  CAPTCHA_SECRET: string;
  PROVIDER_KEY_GOOGLE: string;
  PROVIDER_KEY_GOOGLE_V2?: string;
  PROVIDER_KEY_DEEPL?: string;
  LIMITER_BURST: RateLimiter;
  LIMITER_RATE: RateLimiter;
  LIMITER_SESSION: RateLimiter;
  DB: D1Database;
}
