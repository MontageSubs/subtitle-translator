#!/usr/bin/env bash
set -eo pipefail

SCRIPTS="$GITHUB_WORKSPACE/.github/workflows/scripts"
cd "$GITHUB_WORKSPACE/workers/status"

python3 "$SCRIPTS/lint-workflows.py"
source "$SCRIPTS/load-config.sh" status

npm ci --prefer-offline --no-audit --no-fund --silent
npm run typecheck --silent

BEFORE="$2"
if [ "$1" = push ] && { [ -z "$BEFORE" ] || [[ "$BEFORE" =~ ^0+$ ]] || ! git diff --quiet "$BEFORE" "$3" -- .; }; then
  bash "$SCRIPTS/bump-and-commit.sh" src/version.ts 'STATUS_WORKER_VERSION = "([^"]+)"' "update: status v" "$BEFORE" "$3"
fi

CONFIG="$RUNNER_TEMP/status.toml"
SECRETS="$RUNNER_TEMP/status.json"
LOG="$RUNNER_TEMP/wrangler.log"
trap 'rm -f "$CONFIG" "$SECRETS" "$LOG"' EXIT

python3 "$SCRIPTS/config.py" status "$CONFIG" "$SECRETS"

read_version() { sed -n "s/.*$1 = \"\([^\"]*\)\".*/\1/p" src/version.ts; }
VERSION="v$(read_version STATUS_WORKER_VERSION)"
MESSAGE="$VERSION ($(git rev-parse --short HEAD)) status-api v$(read_version STATUS_API_VERSION) stats-api v$(read_version STATS_API_VERSION)"
npx --no-install wrangler deploy --config "$CONFIG" --secrets-file "$SECRETS" --message "$MESSAGE" --tag "$VERSION" >"$LOG" 2>&1 \
  || { bash "$SCRIPTS/sanitize-output.sh" <"$LOG" >&2; exit 1; }

python3 "$SCRIPTS/config.py" verify status

TRIGGER_ATTEMPTS=5
TRIGGER_RETRY_SECONDS=6
(
  source "$SCRIPTS/load-config.sh" status-admin
  export CHANNEL=worker RAW_ACTION="trigger_cycle"
  for attempt in $(seq 1 "$TRIGGER_ATTEMPTS"); do
    if npx --no-install tsx scripts/admin-cli.ts 2>&1 | bash "$SCRIPTS/sanitize-output.sh"; then exit 0; fi
    [ "$attempt" -lt "$TRIGGER_ATTEMPTS" ] && sleep "$TRIGGER_RETRY_SECONDS"
  done
  echo "::error::the post-deploy status cycle could not be triggered" >&2
  exit 1
)
