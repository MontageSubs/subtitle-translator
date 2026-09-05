#!/usr/bin/env bash
set -euo pipefail

cd workers/status

if [ -n "${TURSO_URL:-}" ]; then
  echo "$TURSO_URL" | npx wrangler secret put TURSO_URL
fi

if [ -n "${TURSO_READ_AUTH_TOKEN:-}" ]; then
  echo "$TURSO_READ_AUTH_TOKEN" | npx wrangler secret put TURSO_READ_AUTH_TOKEN
fi

if [ -n "${CF_PAGES_API_TOKEN:-}" ]; then
  echo "$CF_PAGES_API_TOKEN" | npx wrangler secret put CF_PAGES_API_TOKEN
fi

npx wrangler deploy
