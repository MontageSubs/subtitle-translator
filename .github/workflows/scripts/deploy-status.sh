#!/usr/bin/env bash
set -e

TMP_CONFIG="/tmp/wrangler.status.${GITHUB_RUN_ID:-$$}.toml"
TMP_SECRETS="/tmp/secrets.status.${GITHUB_RUN_ID:-$$}.json"
trap 'rm -f "$TMP_CONFIG" "$TMP_SECRETS"' EXIT

python3 ../../.github/workflows/scripts/prepare-status-deploy.py "$TMP_CONFIG" "$TMP_SECRETS"
chmod 600 "$TMP_CONFIG" "$TMP_SECRETS"

COMMIT_HASH=$(git rev-parse --short "${GITHUB_SHA:-HEAD}" 2>/dev/null || echo "${GITHUB_SHA:0:7}")
MSG="worker translate-status (${COMMIT_HASH})"

set -o pipefail
npx wrangler deploy \
  --config "$TMP_CONFIG" \
  --secrets-file "$TMP_SECRETS" \
  --message "$MSG" 2>&1 | bash ../../.github/workflows/scripts/sanitize-output.sh

