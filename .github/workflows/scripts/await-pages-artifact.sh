#!/usr/bin/env bash
set -euo pipefail

POLL_ATTEMPTS=20
POLL_INTERVAL_SECONDS=3

for attempt in $(seq 1 "$POLL_ATTEMPTS"); do
  VISIBLE="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/artifacts?name=github-pages" --jq '.total_count' 2>/dev/null || echo 0)"
  [ "$VISIBLE" -gt 0 ] && exit 0
  [ "$attempt" -lt "$POLL_ATTEMPTS" ] && sleep "$POLL_INTERVAL_SECONDS"
done
echo "::error::the github-pages artifact never became visible to the run" >&2
exit 1
