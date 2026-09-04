#!/usr/bin/env python3
import json
import os
import re
import sys

if len(sys.argv) < 3:
    sys.stderr.write("Usage: prepare-stats-publisher-deploy.py <target-config-path> <target-secrets-path>\n")
    sys.exit(1)

tmp_cfg = sys.argv[1]
tmp_sec = sys.argv[2]

account_id = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
if not account_id:
    sys.stderr.write("Error: Neither CF_ACCOUNT_ID nor CLOUDFLARE_ACCOUNT_ID is set.\n")
    sys.exit(1)

stats_url = os.environ.get("STATS_URL", "")
pages_proj = os.environ.get("CF_PAGES_PROJECT_VAR") or os.environ.get("CF_PAGES_PROJECT", "")
if not pages_proj:
    m = re.search(r"^https?://([a-zA-Z0-9_-]+)\.pages\.dev(?:/|$)", stats_url)
    if m:
        pages_proj = m.group(1)
    else:
        sys.stderr.write("Error: CF_PAGES_PROJECT is not configured.\n")
        sys.exit(1)

allowed_origin = os.environ.get("ALLOWED_ORIGIN", "https://subs.js.org")

with open("wrangler.toml", "r", encoding="utf-8") as f:
    content = f.read()

abs_entry = os.path.abspath("src/index.ts").replace("\\", "/")
content = re.sub(r'^main\s*=\s*".*"', f'main = "{abs_entry}"', content, flags=re.MULTILINE)
content = content.replace("REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID", account_id)
content = content.replace("REPLACE_WITH_PAGES_PROJECT_NAME", pages_proj)

if allowed_origin:
    content = re.sub(r'^ALLOWED_ORIGIN\s*=\s*".*"', f'ALLOWED_ORIGIN = "{allowed_origin}"', content, flags=re.MULTILINE)

with open(tmp_cfg, "w", encoding="utf-8") as f:
    f.write(content)

secret_keys = ["TURSO_URL", "TURSO_READ_AUTH_TOKEN", "CF_PAGES_API_TOKEN"]
secrets_dict = {}
for k in secret_keys:
    v = os.environ.get(k)
    if v:
        secrets_dict[k] = v

with open(tmp_sec, "w", encoding="utf-8") as f:
    json.dump(secrets_dict, f)