#!/usr/bin/env bash
set -uo pipefail

SCRIPTS="$GITHUB_WORKSPACE/main/.github/workflows/scripts"
source "$SCRIPTS/load-config.sh" build || exit 1

build_channel() {
  local channel="$1" directory="$2" branch="$3"
  (
    cd "$directory"
    export APP_CHANNEL="$channel" VITE_REPO_BRANCH="$branch" APP_BUILD_ID="$(git rev-parse --short HEAD)"
    npm ci --prefer-offline --no-audit --no-fund --silent
    npm run build --silent
  ) >"$RUNNER_TEMP/build-$channel.log" 2>&1
}

build_channel production main/app "$PRODUCTION_BRANCH" &
production_pid=$!
beta_pid=""
if [ "$BETA_PRESENT" = true ]; then
  build_channel beta beta/app beta &
  beta_pid=$!
fi

production_status=0
wait "$production_pid" || production_status=$?
beta_result=skipped
if [ -n "$beta_pid" ]; then
  if wait "$beta_pid"; then beta_result=success; else beta_result=failure; fi
fi

echo "beta=$beta_result" >> "$GITHUB_OUTPUT"
if [ "$production_status" -ne 0 ]; then tail -n 40 "$RUNNER_TEMP/build-production.log" >&2; fi
if [ "$beta_result" = failure ]; then tail -n 40 "$RUNNER_TEMP/build-beta.log" >&2; fi
exit "$production_status"
