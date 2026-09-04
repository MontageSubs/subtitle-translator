#!/usr/bin/env bash
set -e

TMP_CONFIG="/tmp/wrangler.api.${GITHUB_RUN_ID:-$$}.toml"
TMP_SECRETS="/tmp/secrets.api.${GITHUB_RUN_ID:-$$}.json"
trap 'rm -f "$TMP_CONFIG" "$TMP_SECRETS"' EXIT

python3 ../../.github/workflows/scripts/prepare-worker-deploy.py "$TMP_CONFIG" "$TMP_SECRETS"
chmod 600 "$TMP_CONFIG" "$TMP_SECRETS"

VERSION_VAL=$(sed -n 's/.*WORKER_VERSION = "\([^"]*\)".*/\1/p' src/index.ts)
COMMIT_HASH=$(git rev-parse --short "${GITHUB_SHA:-HEAD}" 2>/dev/null || echo "${GITHUB_SHA:0:7}")
TAG_VAL="v${VERSION_VAL:-1.0.0}"
MSG="worker api ${TAG_VAL} (${COMMIT_HASH})"

set -o pipefail
npx wrangler deploy \
  --config "$TMP_CONFIG" \
  --secrets-file "$TMP_SECRETS" \
  --message "$MSG" \
  --tag "$TAG_VAL" 2>&1 | bash ../../.github/workflows/scripts/sanitize-output.sh
