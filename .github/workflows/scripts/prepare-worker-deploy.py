#!/usr/bin/env python3
import os
import sys
import json
import re

if len(sys.argv) < 3:
    sys.stderr.write("Usage: prepare-worker-deploy.py <target-config-path> <target-secrets-path>\n")
    sys.exit(1)

tmp_cfg = sys.argv[1]
tmp_sec = sys.argv[2]

d1_id = os.environ.get("D1_DATABASE_ID", "")
if not d1_id:
    sys.stderr.write("D1_DATABASE_ID secret not set\n")
    sys.exit(1)

with open("wrangler.toml", "r", encoding="utf-8") as f:
    content = f.read()

abs_entry = os.path.abspath("src/index.ts").replace("\\", "/")
content = re.sub(r'^main\s*=\s*".*"', f'main = "{abs_entry}"', content, flags=re.MULTILINE)
content = content.replace("REPLACE_WITH_D1_DATABASE_ID", d1_id)

var_names = [
    "ALLOWED_ORIGIN", "TRANSLATION_PROVIDER", "RISKY_ASNS",
    "QUARANTINE_BASE_DAYS", "QUARANTINE_MAX_DAYS", "DAILY_FREE_QUOTA",
    "DAILY_CAPTCHA_CAP", "BLOCK_DURATION_DAYS", "MALFORMED_THRESHOLD",
    "HANDSHAKE_ABUSE_THRESHOLD", "ABUSE_WINDOW_MINUTES", "GLOBAL_DAILY_BUDGET"
]
for name in var_names:
    val = os.environ.get(name)
    if val is not None and val != "":
        content = re.sub(rf'^{name} = ".*"', f'{name} = "{val}"', content, flags=re.MULTILINE)

with open(tmp_cfg, "w", encoding="utf-8") as f:
    f.write(content)

secret_keys = [
    "TURNSTILE_SECRET_KEY", "TURSO_URL", "TURSO_AUTH_TOKEN",
    "GOOGLE_TRANSLATE_API_KEY", "GOOGLE_TRANSLATE_V2_API_KEY",
    "DEEPL_API_KEY", "WORKER_SALT", "IP_HASH_SALT",
    "WORKER_SECRET_A", "WORKER_SECRET_B"
]
secrets_dict = {}
for k in secret_keys:
    v = os.environ.get(k)
    if v:
        secrets_dict[k] = v

with open(tmp_sec, "w", encoding="utf-8") as f:
    json.dump(secrets_dict, f)
