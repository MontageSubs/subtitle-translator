DROP TABLE IF EXISTS ip_reputation;

CREATE TABLE IF NOT EXISTS ip_shield (
  ip_hash TEXT PRIMARY KEY,
  quarantine_until INTEGER NOT NULL DEFAULT 0,
  quarantine_days INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  day_bucket INTEGER NOT NULL DEFAULT 0,
  free_used INTEGER NOT NULL DEFAULT 0,
  captcha_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nonce_guard (
  nonce INTEGER PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nonce_guard_expires_at ON nonce_guard(expires_at);

CREATE TABLE IF NOT EXISTS retry_token_guard (
  correlation_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_retry_token_guard_expires_at ON retry_token_guard(expires_at);
