#!/usr/bin/env bash
set -eo pipefail

SCRIPTS="$GITHUB_WORKSPACE/.github/workflows/scripts"
cd "$GITHUB_WORKSPACE/workers/api"

python3 "$SCRIPTS/lint-workflows.py"
source "$SCRIPTS/load-config.sh" worker

npm ci --prefer-offline --no-audit --no-fund --silent
npm run typecheck --silent

if [ "$1" = push ]; then
  bash "$SCRIPTS/bump-and-commit.sh" src/version.ts 'WORKER_VERSION = "([^"]+)"' "update: worker v" "$2" "$3"
fi

CONFIG="$RUNNER_TEMP/worker.toml"
SECRETS="$RUNNER_TEMP/worker.json"
LOG="$RUNNER_TEMP/wrangler.log"
trap 'rm -f "$CONFIG" "$SECRETS" "$LOG"' EXIT

python3 "$SCRIPTS/config.py" worker "$CONFIG" "$SECRETS"

VERSION="v$(sed -n 's/.*WORKER_VERSION = "\([^"]*\)".*/\1/p' src/version.ts)"
npx --no-install wrangler deploy --config "$CONFIG" --secrets-file "$SECRETS" --message "$VERSION ($(git rev-parse --short HEAD))" --tag "$VERSION" >"$LOG" 2>&1 \
  || { bash "$SCRIPTS/sanitize-output.sh" <"$LOG" >&2; exit 1; }

python3 "$SCRIPTS/config.py" verify worker
