#!/usr/bin/env bash
set -e

FILE="$1"
PATTERN="$2"
PREFIX="$3"
BEFORE_REF="${4:-}"
TRIGGER_REF="${5:-${GITHUB_SHA:-}}"

if [ -z "$FILE" ] || [ -z "$PATTERN" ] || [ -z "$PREFIX" ]; then
  echo "Usage: bump-and-commit.sh <file> <regex-pattern> <commit-prefix> [before-ref] [trigger-ref]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

VERSION_VAL=$(node "$SCRIPT_DIR/bump-patch-version.mjs" "$FILE" "$PATTERN" "$BEFORE_REF")

if ! git diff --quiet "$FILE"; then
  AUTHOR_NAME="${GITHUB_HEAD_COMMIT_AUTHOR_NAME:-}"
  AUTHOR_EMAIL="${GITHUB_HEAD_COMMIT_AUTHOR_EMAIL:-}"
  if [ -z "$AUTHOR_NAME" ]; then AUTHOR_NAME="${GITHUB_ACTOR:-montagesubs-bot}"; fi
  if [ -z "$AUTHOR_EMAIL" ]; then AUTHOR_EMAIL="${GITHUB_ACTOR:-montagesubs-bot}@users.noreply.github.com"; fi

  if [ -z "$TRIGGER_REF" ]; then
    TRIGGER_REF="$(git rev-parse HEAD 2>/dev/null || true)"
  fi

  git config user.name "montagesubs-bot"
  git config user.email "montagesubs-bot@users.noreply.github.com"
  git add "$FILE"

  COMMIT_ARGS=(-m "${PREFIX}${VERSION_VAL}")
  if [ -n "$TRIGGER_REF" ]; then
    COMMIT_ARGS+=(-m "Source: ${TRIGGER_REF}")
  fi

  git commit --author="$AUTHOR_NAME <$AUTHOR_EMAIL>" "${COMMIT_ARGS[@]}"
  for i in {1..5}; do
    git pull --rebase origin main && git push origin main && break || {
      if [ $i -eq 5 ]; then
        echo "Failed to push version bump after 5 attempts" >&2
        exit 1
      fi
      sleep $((i * 2))
    }
  done
fi
