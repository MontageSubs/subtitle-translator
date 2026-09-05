#!/usr/bin/env python3
import json
import os
import re
import sys

if len(sys.argv) < 3:
    sys.stderr.write("Usage: prepare-status-deploy.py <target-config-path> <target-secrets-path>\n")
    sys.exit(1)

tmp_cfg = sys.argv[1]
tmp_sec = sys.argv[2]

account_id = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
if not account_id:
    sys.stderr.write("Error: Neither CF_ACCOUNT_ID nor CLOUDFLARE_ACCOUNT_ID is set.\n")
    sys.exit(1)

d1_id = os.environ.get("D1_DATABASE_ID") or os.environ.get("CLOUDFLARE_D1_DATABASE_ID")
if not d1_id:
    sys.stderr.write("Error: Neither D1_DATABASE_ID nor CLOUDFLARE_D1_DATABASE_ID is set.\n")
    sys.exit(1)

pages_proj = os.environ.get("CF_PAGES_PROJECT_VAR") or os.environ.get("CF_PAGES_PROJECT") or "subtly"
allowed_origin = os.environ.get("ALLOWED_ORIGIN", "*")
main_site_url = os.environ.get("MAIN_SITE_URL", "").strip() or "https://subs.js.org/subtitle-translator/"
if not main_site_url.endswith("/"):
    main_site_url += "/"

issue_report_url = os.environ.get("ISSUE_REPORT_URL", "").strip()
if not issue_report_url or not issue_report_url.startswith("http"):
    issue_report_url = f"{main_site_url}docs/report-issue/"

github_repo_url = os.environ.get("GITHUB_REPO_URL", "")
if not github_repo_url:
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    server = os.environ.get("GITHUB_SERVER_URL", "https://github").strip().rstrip("/")
    github_repo_url = f"{server}/{repo}" if repo else "https://github.com/MontageSubs/subtitle-translator"

status_url = os.environ.get("STATUS_URL", "")
if not status_url:
    status_url = f"https://{pages_proj}.pages.dev"

cron_schedule = os.environ.get("CRON_SCHEDULE", "").strip() or "1 * * * *"
debug_flag = os.environ.get("DEBUG", "").strip() or "0"

with open("wrangler.toml", "r", encoding="utf-8") as f:
    content = f.read()

abs_entry = os.path.abspath("src/index.ts").replace("\\", "/")
content = re.sub(r'^main\s*=\s*".*"', f'main = "{abs_entry}"', content, flags=re.MULTILINE)

content = content.replace("REPLACE_WITH_D1_DATABASE_ID", d1_id)
content = content.replace("REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID", account_id)
content = content.replace("REPLACE_WITH_PAGES_PROJECT_NAME", pages_proj)
content = content.replace("REPLACE_WITH_CRON_SCHEDULE", cron_schedule)
content = content.replace("REPLACE_WITH_DEBUG_FLAG", debug_flag)

var_replacements = {
    "CF_PAGES_PROJECT": pages_proj,
    "CF_ACCOUNT_ID": account_id,
    "ALLOWED_ORIGIN": allowed_origin,
    "MAIN_SITE_URL": main_site_url,
    "ISSUE_REPORT_URL": issue_report_url,
    "GITHUB_REPO_URL": github_repo_url,
    "STATUS_URL": status_url,
}

for var_name, var_val in var_replacements.items():
    if var_val:
        content = re.sub(rf'^{var_name}\s*=\s*".*"', f'{var_name} = "{var_val}"', content, flags=re.MULTILINE)

with open(tmp_cfg, "w", encoding="utf-8") as f:
    f.write(content)

secret_keys = ["TURSO_URL", "TURSO_AUTH_TOKEN", "CF_PAGES_API_TOKEN", "ADMIN_API_SECRET"]
secrets_dict = {}
for k in secret_keys:
    v = os.environ.get(k)
    if v:
        secrets_dict[k] = v

with open(tmp_sec, "w", encoding="utf-8") as f:
    json.dump(secrets_dict, f)
