import os
import re
from pathlib import Path

def main():
    wrangler_path = Path("workers/status/wrangler.toml")
    if not wrangler_path.exists():
        raise FileNotFoundError(f"Missing {wrangler_path}")

    content = wrangler_path.read_text(encoding="utf-8")

    github_repository = os.environ.get("GITHUB_REPOSITORY", "").strip()
    github_server_url = os.environ.get("GITHUB_SERVER_URL", "https://github").strip().rstrip("/")
    
    auto_repo_url = f"{github_server_url}/{github_repository}" if github_repository else "https://github.com/MontageSubs/subtitle-translator"
    
    github_repo_url = os.environ.get("GITHUB_REPO_URL", "").strip() or auto_repo_url
    
    pages_project = os.environ.get("CF_PAGES_PROJECT", "").strip() or "subtly"
    
    auto_status_url = f"https://{pages_project}.pages.dev"
    status_url = os.environ.get("STATUS_URL", "").strip() or auto_status_url
    
    main_site_url = os.environ.get("MAIN_SITE_URL", "").strip() or "https://subs.js.org/subtitle-translator/"
    if not main_site_url.endswith("/"):
        main_site_url += "/"
        
    issue_report_url = os.environ.get("ISSUE_REPORT_URL", "").strip() or f"{main_site_url}docs/report-issue/"

    d1_id = os.environ.get("CLOUDFLARE_D1_DATABASE_ID", "").strip()
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    allowed_origin = os.environ.get("ALLOWED_ORIGIN", "*").strip()

    if d1_id:
        content = re.sub(r'database_id\s*=\s*"[^"]*"', f'database_id = "{d1_id}"', content)
    if account_id:
        content = re.sub(r'CF_ACCOUNT_ID\s*=\s*"[^"]*"', f'CF_ACCOUNT_ID = "{account_id}"', content)
    if pages_project:
        content = re.sub(r'CF_PAGES_PROJECT\s*=\s*"[^"]*"', f'CF_PAGES_PROJECT = "{pages_project}"', content)
    if allowed_origin:
        content = re.sub(r'ALLOWED_ORIGIN\s*=\s*"[^"]*"', f'ALLOWED_ORIGIN = "{allowed_origin}"', content)
    if main_site_url:
        content = re.sub(r'MAIN_SITE_URL\s*=\s*"[^"]*"', f'MAIN_SITE_URL = "{main_site_url}"', content)
    if issue_report_url:
        content = re.sub(r'ISSUE_REPORT_URL\s*=\s*"[^"]*"', f'ISSUE_REPORT_URL = "{issue_report_url}"', content)
    if github_repo_url:
        content = re.sub(r'GITHUB_REPO_URL\s*=\s*"[^"]*"', f'GITHUB_REPO_URL = "{github_repo_url}"', content)
    if status_url:
        content = re.sub(r'STATUS_URL\s*=\s*"[^"]*"', f'STATUS_URL = "{status_url}"', content)

    wrangler_path.write_text(content, encoding="utf-8")
    print(f"Successfully configured workers/status/wrangler.toml:\n  - GITHUB_REPO_URL: {github_repo_url}\n  - MAIN_SITE_URL: {main_site_url}\n  - STATUS_URL: {status_url}\n  - ISSUE_REPORT_URL: {issue_report_url}\n  - CF_PAGES_PROJECT: {pages_project}")

if __name__ == "__main__":
    main()

