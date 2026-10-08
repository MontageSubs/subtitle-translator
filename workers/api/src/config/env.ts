export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ALLOWED_ORIGIN: string;
  WORKER_SECRET_A?: string;
  WORKER_SECRET_B?: string;
  WORKER_SALT?: string;
  IP_HASH_SALT: string;
  MAX_BATCH_CHARS?: string;
  MAX_CONTENT_CHARS?: string;
  MAX_BODY_BYTES?: string;
  RISKY_ASNS?: string;
  RATE_LIMIT_UNIT_CHARS?: string;
  QUARANTINE_BASE_DAYS?: string;
  QUARANTINE_MAX_DAYS?: string;
  DAILY_CAPTCHA_CAP?: string;
  BLOCK_DURATION_DAYS?: string;
  MALFORMED_THRESHOLD?: string;
  ABUSE_WINDOW_MINUTES?: string;
  GLOBAL_DAILY_BUDGET?: string;
  TRANSLATION_PROVIDER?: string;
  GOOGLE_TRANSLATE_API_KEY: string;
  GOOGLE_TRANSLATE_V2_API_KEY?: string;
  DEEPL_API_KEY?: string;
  TURSO_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
  BURST_LIMITER: RateLimiter;
  RATE_LIMITER: RateLimiter;
  HANDSHAKE_LIMITER: RateLimiter;
  DB: D1Database;
}
