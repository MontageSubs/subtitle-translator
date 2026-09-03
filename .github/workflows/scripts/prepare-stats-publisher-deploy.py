#!/usr/bin/env python3
import os
import sys
import json
import re

if len(sys.argv) < 3:
    sys.stderr.write("Usage: prepare-stats-publisher-deploy.py <target-config-path> <target-secrets-path>\n")
    sys.exit(1)

tmp_cfg = sys.argv[1]
tmp_sec = sys.argv[2]

cf_account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID", "")
stats_url = os.environ.get("STATS_URL", "")
if not cf_account_id or not stats_url:
    sys.stderr.write("CLOUDFLARE_ACCOUNT_ID or STATS_URL is not set\n")
    sys.exit(1)

pages_proj = os.environ.get("CF_PAGES_PROJECT_VAR") or os.environ.get("CF_PAGES_PROJECT", "")
if not pages_proj:
    m = re.search(r"^https?://([^./]+)\.", stats_url)
    pages_proj = m.group(1) if m else "subtitle-translator"

with open("wrangler.toml", "r", encoding="utf-8") as f:
    content = f.read()

abs_entry = os.path.abspath("src/index.ts").replace("\\", "/")
content = re.sub(r'^main\s*=\s*".*"', f'main = "{abs_entry}"', content, flags=re.MULTILINE)

content = content.replace("REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID", cf_account_id)
content = content.replace("REPLACE_WITH_PAGES_PROJECT_NAME", pages_proj)

allowed_origin = os.environ.get("ALLOWED_ORIGIN", "")
if allowed_origin:
    content = re.sub(r'^ALLOWED_ORIGIN = ".*"', f'ALLOWED_ORIGIN = "{allowed_origin}"', content, flags=re.MULTILINE)

with open(tmp_cfg, "w", encoding="utf-8") as f:
    f.write(content)

secret_keys = ["CF_PAGES_API_TOKEN", "TURSO_URL", "TURSO_READ_AUTH_TOKEN", "STATS_URL"]
secrets_dict = {}
for k in secret_keys:
    v = os.environ.get(k)
    if v:
        secrets_dict[k] = v

with open(tmp_sec, "w", encoding="utf-8") as f:
    json.dump(secrets_dict, f)
