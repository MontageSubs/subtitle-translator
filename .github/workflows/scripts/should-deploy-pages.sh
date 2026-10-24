#!/usr/bin/env bash
set -euo pipefail

BEFORE_REF="${1:-}"
HEAD_REF="${2:-HEAD}"
MANIFEST="docs/manifest.yml"

if [ -z "$BEFORE_REF" ] || [[ "$BEFORE_REF" =~ ^0+$ ]] || ! git cat-file -e "$BEFORE_REF^{commit}" 2>/dev/null; then
  echo true
  exit 0
fi

PUBLISHED_SLUGS="$(sed -nE 's/^[[:space:]]*-[[:space:]]*slug:[[:space:]]*"?([^"[:space:]#]+)"?.*/\1/p' "$MANIFEST")"

while IFS= read -r file; do
  case "$file" in
    app/*|"$MANIFEST")
      echo true
      exit 0
      ;;
    docs/github/*)
      ;;
    docs/*/*)
      slug="${file#docs/}"
      slug="${slug%%/*}"
      if grep -qxF "$slug" <<<"$PUBLISHED_SLUGS"; then
        echo true
        exit 0
      fi
      ;;
  esac
done < <(git diff --name-only "$BEFORE_REF" "$HEAD_REF")

echo false
