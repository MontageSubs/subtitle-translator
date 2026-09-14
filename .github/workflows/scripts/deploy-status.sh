#!/usr/bin/env bash
set -e

TMP_CONFIG="/tmp/wrangler.status.${GITHUB_RUN_ID:-$$}.toml"
TMP_SECRETS="/tmp/secrets.status.${GITHUB_RUN_ID:-$$}.json"
trap 'rm -f "$TMP_CONFIG" "$TMP_SECRETS"' EXIT

python3 ../../.github/workflows/scripts/prepare-status-deploy.py "$TMP_CONFIG" "$TMP_SECRETS"
chmod 600 "$TMP_CONFIG" "$TMP_SECRETS"

COMMIT_HASH=$(git rev-parse --short "${GITHUB_SHA:-HEAD}" 2>/dev/null || echo "${GITHUB_SHA:0:7}")
MSG="worker translate-status (${COMMIT_HASH})"

set +e
RAW_OUTPUT=$(npx --no-install wrangler deploy \
  --config "$TMP_CONFIG" \
  --secrets-file "$TMP_SECRETS" \
  --message "$MSG" 2>&1)
DEPLOY_EXIT=$?
set -e

echo "$RAW_OUTPUT" | bash ../../.github/workflows/scripts/sanitize-output.sh

if [ $DEPLOY_EXIT -ne 0 ]; then
  exit $DEPLOY_EXIT
fi

CLEAN_OUTPUT=$(echo "$RAW_OUTPUT" | sed -r "s/\x1B\[([0-9]{1,3}(;[0-9]{1,2})?)?[mGK]//g")
RESOLVED_URL="${STATUS_WORKER_URL:-}"
if [ -z "$RESOLVED_URL" ]; then
  RESOLVED_URL=$(echo "$CLEAN_OUTPUT" | grep -oE 'https?://[a-zA-Z0-9.-]+' | head -n 1)
fi

if [ -n "$RESOLVED_URL" ]; then
  RESOLVED_URL=$(echo "$RESOLVED_URL" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  if [[ "$RESOLVED_URL" != http*://* ]]; then
    RESOLVED_URL="https://$RESOLVED_URL"
  fi
  RESOLVED_URL="${RESOLVED_URL%/}"
  echo "::add-mask::$RESOLVED_URL"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "worker_url=$RESOLVED_URL" >> "$GITHUB_OUTPUT"
  fi
fi

