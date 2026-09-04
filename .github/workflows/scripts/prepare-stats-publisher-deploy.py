#!/usr/bin/env python3
import os
import re
import sys

account_id = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
api_token = os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN")
turso_url = os.environ.get("TURSO_DATABASE_URL", "")
turso_token = os.environ.get("TURSO_AUTH_TOKEN", "")
stats_url = os.environ.get("STATS_URL", "")

if not account_id:
    sys.stderr.write("Error: Neither CF_ACCOUNT_ID nor CLOUDFLARE_ACCOUNT_ID is set.\n")
    sys.exit(1)

if not api_token:
    sys.stderr.write("Error: Neither CF_API_TOKEN nor CLOUDFLARE_API_TOKEN is set.\n")
    sys.exit(1)

pages_proj = os.environ.get("CF_PAGES_PROJECT_VAR") or os.environ.get("CF_PAGES_PROJECT", "")
if not pages_proj:
    m = re.search(r"^https?://([a-zA-Z0-9_-]+)\.pages\.dev(?:/|$)", stats_url)
    if m:
        pages_proj = m.group(1)
    else:
        sys.stderr.write(
            "Error: CF_PAGES_PROJECT is not configured, and STATS_URL uses a custom domain.\n"
            "Please configure the repository variable 'CF_PAGES_PROJECT' with your Cloudflare Pages project name.\n"
        )
        sys.exit(1)

with open("wrangler.toml", "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(
    r'(CF_ACCOUNT_ID\s*=\s*)"[^"]*"',
    f'\\1"{account_id}"',
    content
)
content = re.sub(
    r'(CF_PAGES_PROJECT\s*=\s*)"[^"]*"',
    f'\\1"{pages_proj}"',
    content
)
content = re.sub(
    r'(TURSO_DATABASE_URL\s*=\s*)"[^"]*"',
    f'\\1"{turso_url}"',
    content
)
content = re.sub(
    r'(STATS_URL\s*=\s*)"[^"]*"',
    f'\\1"{stats_url}"',
    content
)

with open("wrangler.toml", "w", encoding="utf-8") as f:
    f.write(content)

print(f"Configured wrangler.toml: account_id={account_id[:6]}..., pages_project={pages_proj}")