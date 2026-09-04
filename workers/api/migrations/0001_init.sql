CREATE TABLE IF NOT EXISTS ip_shield (
  ip_hash TEXT PRIMARY KEY,
  quarantine_until INTEGER NOT NULL DEFAULT 0,
  quarantine_days INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  day_bucket INTEGER NOT NULL DEFAULT 0,
  free_used INTEGER NOT NULL DEFAULT 0,
  captcha_count INTEGER NOT NULL DEFAULT 0,
  window_bucket INTEGER NOT NULL DEFAULT 0,
  malformed_count INTEGER NOT NULL DEFAULT 0,
  handshake_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS global_budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  day_bucket INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO global_budget (id, day_bucket, used) VALUES (1, 0, 0);

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
