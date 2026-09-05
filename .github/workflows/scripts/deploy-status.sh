#!/usr/bin/env bash
set -e

TMP_CONFIG="/tmp/wrangler.status.${GITHUB_RUN_ID:-$$}.toml"
TMP_SECRETS="/tmp/secrets.status.${GITHUB_RUN_ID:-$$}.json"
trap 'rm -f "$TMP_CONFIG" "$TMP_SECRETS"' EXIT

python3 ../../.github/workflows/scripts/prepare-status-deploy.py "$TMP_CONFIG" "$TMP_SECRETS"
chmod 600 "$TMP_CONFIG" "$TMP_SECRETS"

COMMIT_HASH=$(git rev-parse --short "${GITHUB_SHA:-HEAD}" 2>/dev/null || echo "${GITHUB_SHA:0:7}")
MSG="worker translate-status (${COMMIT_HASH})"

DEPLOY_LOG=$(mktemp)
set -o pipefail
npx wrangler deploy \
  --config "$TMP_CONFIG" \
  --secrets-file "$TMP_SECRETS" \
  --message "$MSG" 2>&1 | tee "$DEPLOY_LOG" | bash ../../.github/workflows/scripts/sanitize-output.sh

DEPLOYED_URL=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.workers\.dev' "$DEPLOY_LOG" | head -n 1 || true)
rm -f "$DEPLOY_LOG"

if [ -n "$GITHUB_OUTPUT" ] && [ -n "$DEPLOYED_URL" ]; then
  echo "worker_url=$DEPLOYED_URL" >> "$GITHUB_OUTPUT"
fi

