#!/usr/bin/env bash
set -euo pipefail

BEFORE_REF="${1:-}"
TRIGGER_REF="${2:?trigger ref is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

changes_shared_build() {
  local status file
  while IFS=$'\t' read -r status file; do
    case "$status:$file" in
      M:app/src/i18n/locales/en.json|M:app/src/metadata/en.json) return 0 ;;
      M:app/src/i18n/locales/*.json|M:app/src/metadata/*.json) ;;
      *) return 0 ;;
    esac
  done < <(git diff --name-status --no-renames "$BEFORE_REF" "$TRIGGER_REF" -- app)
  return 1
}

if [ -n "$BEFORE_REF" ] && ! [[ "$BEFORE_REF" =~ ^0+$ ]] && ! changes_shared_build; then
  exit 0
fi

bash "$SCRIPT_DIR/bump-and-commit.sh" app/version.json '"version": "([^"]+)"' "update: page v" "$BEFORE_REF" "$TRIGGER_REF"
