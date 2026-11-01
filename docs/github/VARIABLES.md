# Configuration reference

Generated from `.github/config/manifest.json` by `config.py docs`. Do not edit by hand.

Every name lives in exactly one place. Blocks hold one `KEY=VALUE` pair per line; blank lines and lines that start with `#` are ignored.

Credentials are never merged into blocks. Secret blocks exist so that tuning values never appear in public Actions logs.

## `DOMAIN`

- Stored as: GitHub repository **Variable**
- Type: block
- Purpose: Hostname layout of the whole service. Every public URL is derived from it.

| Key | Required | Type | Delivered as | Format example | Meaning |
| --- | --- | --- | --- | --- | --- |
| `BASE` | yes | hostname | Build time or CI only | `example.com` | Zone apex. The translator worker is bound to this hostname; status., assets. and models. are subdomains of it. Used for: Worker SERVICE_URL, frontend build URLs, status worker STATUS_URL, WAF host list. |
| `FALLBACK` | no | hostname | Build time or CI only | `standby.example` | Second zone bound to the translator worker as standby API host. Empty disables the fallback. Used for: Worker FALLBACK_URL and the WAF host list of the fallback zone. |
| `RETIRING` | no | list | Build time or CI only | `old.example.com` | Comma-separated hostnames that stay bound while clients migrate away from them. Empty when no migration is running. Used for: WAF host list printed after each worker deploy so that old hosts stay allowed until removed. |

## `SITE`

- Stored as: GitHub repository **Variable**
- Type: block
- Purpose: Public frontend identity.

| Key | Required | Type | Delivered as | Format example | Meaning |
| --- | --- | --- | --- | --- | --- |
| `FRONTEND_URL` | yes | url | Build time or CI only | `https://app.example.org/tool/` | Canonical frontend URL with trailing path. |
| `FRONTEND_ORIGINS` | yes | list | Worker variable (visible to dashboard users) | `https://app.example.org,https://owner.github.io` | Comma-separated browser origins allowed to call the translator worker. |
| `FEEDBACK_URL` | no | url | Build time or CI only | `https://app.example.org/tool/docs/feedback/` | Feedback page. Defaults to FRONTEND_URL plus docs/feedback/. |
| `TURNSTILE_SITE_KEY` | yes | str | Build time or CI only | `0xAAAAAAAAAAAAAAAAAAAAAA` | Public Turnstile widget key. |

## `CF_NAMES`

- Stored as: GitHub repository **Variable**
- Type: block
- Purpose: Cloudflare resource names. Pages entries are the pages.dev label (the part before .pages.dev), not the project name, so the project can be renamed in the dashboard without breaking deployments.

| Key | Required | Type | Delivered as | Format example | Meaning |
| --- | --- | --- | --- | --- | --- |
| `STATUS` | yes | str | Build time or CI only | `stus` | pages.dev label of the status page project. |
| `ASSETS` | yes | str | Build time or CI only | `tnsr` | pages.dev label of the runtime assets project. |
| `MODELS` | no | str | Build time or CI only | `mdls` | pages.dev label of the model mirror project. Empty disables the mirror workflow. |
| `WORKER_TRANSLATE` | no, default `subtitle-translator` | str | Build time or CI only | `subtitle-translator` | Worker that serves the translation API. |
| `WORKER_STATUS` | no, default `subtitle-translator-status-api` | str | Build time or CI only | `subtitle-translator-status-api` | Worker that probes services and publishes the status page. |

## `TR_RUNTIME`

- Stored as: GitHub repository **Variable**
- Type: block
- Purpose: Non-sensitive translator worker limits and logging.

| Key | Required | Type | Delivered as | Format example | Meaning |
| --- | --- | --- | --- | --- | --- |
| `MAX_BATCH_CHARS` | no, default `8000` | int | Worker variable (visible to dashboard users) | `8000` | Maximum characters per upstream batch. |
| `MAX_CONTENT_CHARS` | no, default `200000` | int | Worker variable (visible to dashboard users) | `200000` | Maximum characters per subtitle job. |
| `MAX_BODY_BYTES` | no, default `4000000` | int | Worker variable (visible to dashboard users) | `4000000` | Maximum request body size. |
| `RATE_LIMIT_UNIT_CHARS` | no, default `500` | int | Worker variable (visible to dashboard users) | `500` | Characters that count as one rate-limit unit. |
| `PROVIDER_LIMITS` | no | json | Worker variable (visible to dashboard users) | `{"provider":{"maxBatchChars":4000}}` | Optional per-provider overrides as one-line JSON. |
| `STREAM_LOG` | no, default `1` | bool | Worker variable (visible to dashboard users) | `1` | 1 streams engine trace events to clients. |
| `DEBUG` | no, default `0` | int | Worker variable (visible to dashboard users) | `0` | 0 to 2, worker log verbosity. |

## `ST_RUNTIME`

- Stored as: GitHub repository **Variable**
- Type: block
- Purpose: Status worker scheduling and logging.

| Key | Required | Type | Delivered as | Format example | Meaning |
| --- | --- | --- | --- | --- | --- |
| `CRON` | no, default `1 * * * *` | str | Build time or CI only | `1 * * * *` | Cron expression of the status cycle. |
| `DEBUG` | no, default `0` | int | Build time or CI only | `0` | 0 to 2, status worker log verbosity. |

## `CF_ACCOUNT`

- Stored as: GitHub repository **Secret**
- Type: block
- Purpose: Cloudflare account identifiers.

| Key | Required | Type | Delivered as | Format example | Meaning |
| --- | --- | --- | --- | --- | --- |
| `ACCOUNT_ID` | yes | hex32 | Build time or CI only | `0123456789abcdef0123456789abcdef` | Cloudflare account id. |
| `D1_ID` | yes | uuid | Build time or CI only | `00000000-0000-0000-0000-000000000000` | D1 database id. |
| `D1_NAME` | no, default `subtitle-translator` | str | Build time or CI only | `subtitle-translator` | D1 database name. Not a secret, so it is never masked in logs. Must match the database that D1_ID points to. |

## `CF_TOKEN_WORKERS`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: API token for wrangler deploys and D1 operations. Permissions: Account: Workers Scripts Edit, D1 Edit.
- Delivered as: CI only
- Required: yes
- Example: `<api token>`

## `CF_TOKEN_PAGES`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: API token for Pages deploys of runtime assets and the model mirror. Permissions: Account: Cloudflare Pages Edit.
- Delivered as: CI only
- Required: yes
- Example: `<api token>`

## `CF_TOKEN_STATUS`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: API token for status worker runtime, publishes the status page. Permissions: Account: Cloudflare Pages Edit.
- Delivered as: CI only
- Required: yes
- Example: `<api token>`

## `DB_TURSO_URL`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Turso database URL.
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `libsql://name-org.turso.io`

## `DB_TURSO_TOKEN`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Turso database token.
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `<token>`

## `TR_POLICY`

- Stored as: GitHub repository **Secret**
- Type: block
- Purpose: Abuse, quota, lifetime and limiter tuning of the translator worker. Stored as a secret so public logs never show it; delivered to the worker as plain variables.

| Key | Required | Type | Delivered as | Format example | Meaning |
| --- | --- | --- | --- | --- | --- |
| `PROVIDER` | yes | str | Worker variable (visible to dashboard users) | `<str>` | Default translation provider id. |
| `RISKY_ASNS` | no | list | Worker variable (visible to dashboard users) | `<list>` | Comma-separated ASNs treated as risky. Empty disables the feature. |
| `QUARANTINE_BASE_DAYS` | yes | int | Worker variable (visible to dashboard users) | `<int>` | First quarantine length in days. |
| `QUARANTINE_MAX_DAYS` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Upper bound of escalating quarantine in days. |
| `DAILY_CAPTCHA_CAP` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Captcha solves per day before escalation. |
| `BLOCK_DURATION_DAYS` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Block length in days. |
| `MALFORMED_THRESHOLD` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Malformed requests per window before clearance is required. |
| `ABUSE_WINDOW_MINUTES` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Abuse counting window in minutes. |
| `GLOBAL_DAILY_BUDGET` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Global daily request budget. |
| `OUTPUT_GUARD` | yes | bool | Worker variable (visible to dashboard users) | `<bool>` | 1 blocks responses that contain a configured secret. |
| `RETENTION_DAYS` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Days a reputation row is kept. |
| `SESSION_STANDBY_SECONDS` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Lifetime of a session issued by /session. |
| `SESSION_ACTIVE_SECONDS` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Lifetime of a session issued after a translation. |
| `CLEARANCE_SECONDS` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Lifetime of a clearance token. |
| `RETRY_TOKEN_SECONDS` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Lifetime of a retry token. |
| `RATE_DEGRADED_DIVISOR` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Divisor of the rate-limit unit for degraded callers. |
| `RATE_PLAIN_DIVISOR` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Divisor of the rate-limit unit for the plain client variant. |
| `CLEARED_MULTIPLIER` | yes | int | Worker variable (visible to dashboard users) | `<int>` | Rate-limit multiplier after a solved captcha. |
| `LIMIT_RATE_PER_MINUTE` | yes | int | Rate-limiter binding (deploy config) | `<int>` | Rate limiter: units per minute per client. |
| `LIMIT_BURST_PER_10S` | yes | int | Rate-limiter binding (deploy config) | `<int>` | Burst limiter: requests per 10 seconds per client. |
| `LIMIT_SESSION_PER_MINUTE` | yes | int | Rate-limiter binding (deploy config) | `<int>` | Session limiter: requests per minute per client. |

## `TR_KEY_GOOGLE`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Google translation API key (provider google-nmt-pa).
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `<secret>`

## `TR_KEY_GOOGLE_V2`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Google Translation v2 API key. Optional.
- Delivered as: Cloudflare secret (hidden)
- Required: no
- Example: `<secret>`

## `TR_KEY_DEEPL`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: DeepL API key. Optional.
- Delivered as: Cloudflare secret (hidden)
- Required: no
- Example: `<secret>`

## `TR_TURNSTILE_SECRET`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Turnstile secret key.
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `<secret>`

## `TR_SALT_KEYRING`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Salt that derives signing keys from SECRET_A and SECRET_B.
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `<secret>`

## `TR_SALT_IPHASH`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Salt of the IP hash. Keeps plain IP addresses out of the database.
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `<secret>`

## `TR_SECRET_A`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Signing secret slot A. Rotated weekly with slot B.
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `<secret>`

## `TR_SECRET_B`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Signing secret slot B. Rotated weekly with slot A.
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `<secret>`

## `ST_ADMIN_TOKEN`

- Stored as: GitHub repository **Secret**
- Type: single value
- Purpose: Admin token of the status worker. Also the value of the x-gateway-automation-token header.
- Delivered as: Cloudflare secret (hidden)
- Required: yes
- Example: `<token>`
