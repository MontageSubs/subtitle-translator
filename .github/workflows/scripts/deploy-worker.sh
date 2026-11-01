#!/usr/bin/env bash
set -e

SCRIPTS="../../.github/workflows/scripts"
source "$SCRIPTS/load-config.sh" worker

TMP_CONFIG="/tmp/wrangler.api.${GITHUB_RUN_ID:-$$}.toml"
TMP_SECRETS="/tmp/secrets.api.${GITHUB_RUN_ID:-$$}.json"
trap 'rm -f "$TMP_CONFIG" "$TMP_SECRETS"' EXIT

python3 "$SCRIPTS/config.py" worker "$TMP_CONFIG" "$TMP_SECRETS"

VERSION_VAL=$(sed -n 's/.*WORKER_VERSION = "\([^"]*\)".*/\1/p' src/version.ts)
COMMIT_HASH=$(git rev-parse --short "${GITHUB_SHA:-HEAD}" 2>/dev/null || echo "${GITHUB_SHA:0:7}")
TAG_VAL="v${VERSION_VAL:-1.0.0}"
MSG="${TAG_VAL} (${COMMIT_HASH})"

set -o pipefail
npx --no-install wrangler deploy \
  --config "$TMP_CONFIG" \
  --secrets-file "$TMP_SECRETS" \
  --message "$MSG" \
  --tag "$TAG_VAL" 2>&1 | bash "$SCRIPTS/sanitize-output.sh"

python3 "$SCRIPTS/config.py" verify worker
