#!/usr/bin/env bash
set -euo pipefail

[ -n "${VITE_INDEXNOW_KEY:-}" ] || exit 0

SCRIPTS="$GITHUB_WORKSPACE/main/.github/workflows/scripts"
source "$SCRIPTS/load-config.sh" pages
echo "::add-mask::$VITE_INDEXNOW_KEY"

node "$SCRIPTS/submit-indexnow.mjs" --sitemap main/app/dist/sitemap.xml --site-url "$MAIN_SITE_URL"
