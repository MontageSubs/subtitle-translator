#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${GITHUB_REF_NAME:-main}"
TRIGGER_REF="${1:-${GITHUB_SHA:-}}"

MESSAGES=()
CHANGED_PATHS=()

record_changes() {
  local message="$1"
  shift
  local paths
  paths="$(git diff --name-only -- "$@")"
  if [ -z "$paths" ]; then
    return 0
  fi
  MESSAGES+=("$message")
  while IFS= read -r path; do
    CHANGED_PATHS+=("$path")
  done <<<"$paths"
}

node "$SCRIPT_DIR/sort-i18n-keys.mjs"
record_changes "sort i18n keys" app/src/i18n/locales

if [ ${#CHANGED_PATHS[@]} -eq 0 ]; then
  exit 0
fi

AUTHOR_NAME="${GITHUB_HEAD_COMMIT_AUTHOR_NAME:-}"
AUTHOR_EMAIL="${GITHUB_HEAD_COMMIT_AUTHOR_EMAIL:-}"
if [ -z "$AUTHOR_NAME" ]; then AUTHOR_NAME="${GITHUB_ACTOR:-montagesubs-bot}"; fi
if [ -z "$AUTHOR_EMAIL" ]; then AUTHOR_EMAIL="${GITHUB_ACTOR:-montagesubs-bot}@users.noreply.github.com"; fi

if [ -z "$TRIGGER_REF" ]; then
  TRIGGER_REF="$(git rev-parse HEAD 2>/dev/null || true)"
fi

if [ ${#MESSAGES[@]} -eq 1 ]; then
  SUBJECT="fix: ${MESSAGES[0]}"
else
  SUBJECT="fix: $(printf '%s; ' "${MESSAGES[@]}" | sed 's/; $//')"
fi

git config user.name "montagesubs-bot"
git config user.email "montagesubs-bot@users.noreply.github.com"
git add -- "${CHANGED_PATHS[@]}"

COMMIT_ARGS=(-m "$SUBJECT")
if [ -n "$TRIGGER_REF" ]; then
  COMMIT_ARGS+=(-m "Source: ${TRIGGER_REF}")
fi

git commit -q --author="$AUTHOR_NAME <$AUTHOR_EMAIL>" "${COMMIT_ARGS[@]}"
for i in {1..5}; do
  git pull -q --rebase origin "$BRANCH" && git push -q origin "$BRANCH" && break || {
    if [ $i -eq 5 ]; then
      echo "Failed to push auto-fix after 5 attempts" >&2
      exit 1
    fi
    sleep $((i * 2))
  }
done
