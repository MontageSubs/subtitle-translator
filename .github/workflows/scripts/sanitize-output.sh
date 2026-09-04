#!/usr/bin/env bash
set -e
exec python3 -c '
import re
import sys

account_pattern = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}\x27s Account")
email_pattern = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}")
account_id_pattern = re.compile(r"│(\s*)[a-f0-9]{32}(\s*)│")

in_bindings = False

for line in sys.stdin:
    if "following bindings:" in line:
        in_bindings = True
        continue
    if "packages/wrangler/telemetry.md" in line or "Cloudflare collects anonymous telemetry" in line:
        continue
    if in_bindings:
        if line.startswith("✘") or re.search(r"\b(?:Error|error|FAILED|failed)\b", line):
            in_bindings = False
        elif line.strip() == "" or line.startswith("Uploaded ") or line.startswith("Deployed ") or line.startswith("Current Version"):
            in_bindings = False
            if line.strip() == "":
                continue
        else:
            continue

    line = account_pattern.sub("[redacted-account]", line)
    line = email_pattern.sub("[redacted-email]", line)
    line = account_id_pattern.sub(r"│\1[redacted-account-id]\2│", line)
    sys.stdout.write(line)
'
