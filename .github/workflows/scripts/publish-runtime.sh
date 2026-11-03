#!/usr/bin/env bash
set -euo pipefail

SCRIPTS="$GITHUB_WORKSPACE/main/.github/workflows/scripts"
source "$SCRIPTS/load-config.sh" pages

if [ -f main/app/runtime/publish.ts ]; then
  PUBLISHER_DIR=main/app
elif [ "$BETA_PRESENT" = true ] && [ -f beta/app/runtime/publish.ts ]; then
  PUBLISHER_DIR=beta/app
else
  exit 0
fi

ARGS=(--app "production=$GITHUB_WORKSPACE/main/app" --worker-version "$GITHUB_WORKSPACE/main/workers/api/src/version.ts")
if [ "$BETA_RESULT" = success ]; then
  ARGS+=(--app "beta=$GITHUB_WORKSPACE/beta/app")
elif [ "$BETA_PRESENT" = true ]; then
  ARGS+=(--retain beta)
fi

cd "$PUBLISHER_DIR"
npx --no-install tsx runtime/publish.ts "${ARGS[@]}"
