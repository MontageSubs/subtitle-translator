#!/usr/bin/env bash
set -euo pipefail

EVENT="$1"
BUMP="$2"
BEFORE="$3"
SHA="$4"
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEPLOY=true
if [ "$EVENT" = push ]; then
  DEPLOY="$(bash "$SCRIPTS/should-deploy-pages.sh" "$BEFORE" "$SHA")"
fi
if [ "$DEPLOY" = true ] && { [ "$EVENT" = push ] || [ "$BUMP" = true ]; }; then
  bash "$SCRIPTS/auto-fix-and-commit.sh" "$SHA"
  bash "$SCRIPTS/bump-app-version.sh" "$BEFORE" "$SHA"
fi
echo "deploy=$DEPLOY" >> "$GITHUB_OUTPUT"
