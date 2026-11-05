#!/usr/bin/env bash
set -euo pipefail

SCRIPTS="$GITHUB_WORKSPACE/main/.github/workflows/scripts"
source "$SCRIPTS/load-config.sh" pages

PUBLISHER_DIR=$(node "$SCRIPTS/newest-channel.mjs" --require runtime/publish.ts main/app beta/app)
[ -n "$PUBLISHER_DIR" ] || exit 0

ARGS=(--app "production=$GITHUB_WORKSPACE/main/app" --worker-version "$GITHUB_WORKSPACE/main/workers/api/src/version.ts")
if [ "$BETA_RESULT" = success ]; then
  ARGS+=(--app "beta=$GITHUB_WORKSPACE/beta/app")
elif [ "$BETA_PRESENT" = true ]; then
  ARGS+=(--retain beta)
fi

cd "$PUBLISHER_DIR"
npx --no-install tsx runtime/publish.ts "${ARGS[@]}"
