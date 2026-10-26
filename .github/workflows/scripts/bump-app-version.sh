#!/usr/bin/env bash
set -euo pipefail

BEFORE_REF="${1:-}"
TRIGGER_REF="${2:?trigger ref is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "$BEFORE_REF" ] && ! [[ "$BEFORE_REF" =~ ^0+$ ]] && git diff --quiet "$BEFORE_REF" "$TRIGGER_REF" -- app; then
  echo "app/ unchanged in this push; version left as is"
  exit 0
fi

bash "$SCRIPT_DIR/bump-and-commit.sh" app/version.json '"version": "([^"]+)"' "update: page v" "$BEFORE_REF" "$TRIGGER_REF"
