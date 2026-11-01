#!/usr/bin/env bash
set -e

SCRIPTS="../../.github/workflows/scripts"
source "$SCRIPTS/load-config.sh" status

TMP_CONFIG="/tmp/wrangler.status.${GITHUB_RUN_ID:-$$}.toml"
TMP_SECRETS="/tmp/secrets.status.${GITHUB_RUN_ID:-$$}.json"
trap 'rm -f "$TMP_CONFIG" "$TMP_SECRETS"' EXIT

python3 "$SCRIPTS/config.py" status "$TMP_CONFIG" "$TMP_SECRETS"

read_version() {
  sed -n "s/.*$1 = \"\([^\"]*\)\".*/\1/p" src/version.ts
}

WORKER_VERSION_VAL=$(read_version STATUS_WORKER_VERSION)
STATUS_API_VERSION_VAL=$(read_version STATUS_API_VERSION)
STATS_API_VERSION_VAL=$(read_version STATS_API_VERSION)
MIN_STATUS_CLIENT_VAL=$(read_version MIN_STATUS_CLIENT_VERSION)
MIN_STATS_CLIENT_VAL=$(read_version MIN_STATS_CLIENT_VERSION)
COMMIT_HASH=$(git rev-parse --short "${GITHUB_SHA:-HEAD}" 2>/dev/null || echo "${GITHUB_SHA:0:7}")
TAG_VAL="v${WORKER_VERSION_VAL:-1.0.0}"
MSG="${TAG_VAL} (${COMMIT_HASH}) status-api v${STATUS_API_VERSION_VAL} stats-api v${STATS_API_VERSION_VAL}"

echo "Deploying ${TAG_VAL} (${COMMIT_HASH})"
echo "status.json: v${STATUS_API_VERSION_VAL}, requires app >= ${MIN_STATUS_CLIENT_VAL}"
echo "stats.json: v${STATS_API_VERSION_VAL}, requires app >= ${MIN_STATS_CLIENT_VAL}"

set -o pipefail
npx --no-install wrangler deploy \
  --config "$TMP_CONFIG" \
  --secrets-file "$TMP_SECRETS" \
  --message "$MSG" \
  --tag "$TAG_VAL" 2>&1 | bash "$SCRIPTS/sanitize-output.sh"

python3 "$SCRIPTS/config.py" verify status
