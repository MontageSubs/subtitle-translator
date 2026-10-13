#!/usr/bin/env bash
set -u

WORKER_URL="$(echo "${WORKER_URL:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
if [ -z "$WORKER_URL" ] && [ -n "${STATUS_URL:-}" ]; then
  WORKER_URL="$(echo "${STATUS_URL}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
fi
[ -n "$WORKER_URL" ] && echo "::add-mask::$WORKER_URL"
[ -n "${TOKEN:-}" ] && echo "::add-mask::$TOKEN"

if [ -z "$WORKER_URL" ]; then
  echo "No status worker URL configured, skipping status cycle trigger."
  exit 0
fi

[[ "$WORKER_URL" == http*://* ]] || WORKER_URL="https://$WORKER_URL"

WAIT_SECONDS="${PROPAGATION_WAIT_SECONDS:-20}"
if [[ "$WAIT_SECONDS" =~ ^[0-9]+$ ]] && [ "$WAIT_SECONDS" -gt 0 ]; then
  echo "Waiting ${WAIT_SECONDS}s for Cloudflare Worker edge deployment to propagate..."
  sleep "$WAIT_SECONDS"
fi

MAX_ATTEMPTS=3
RETRY_DELAY=5

for attempt in $(seq 1 $MAX_ATTEMPTS); do
  echo "Triggering status cycle (attempt $attempt/$MAX_ATTEMPTS)..."
  HTTP_CODE=$(curl -sS -o /tmp/trigger_response.json -w "%{http_code}" -X POST "${WORKER_URL%/}/api/admin/cycle/trigger" \
    -A "MontageSubs-Status/1.0" \
    -H "X-Gateway-Automation-Token: ${TOKEN:-}" \
    -H "Content-Type: application/json" \
    -d '{"mode":"full"}' || echo "000")

  echo "Trigger HTTP status code: $HTTP_CODE"
  [ -f /tmp/trigger_response.json ] && cat /tmp/trigger_response.json && echo ""

  if [[ "$HTTP_CODE" == 2* ]]; then
    echo "Status cycle triggered successfully."
    exit 0
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    echo "Trigger returned non-2xx ($HTTP_CODE). Retrying in ${RETRY_DELAY}s..."
    sleep "$RETRY_DELAY"
  fi
done

echo "Trigger notice: worker will execute on next cron schedule"
exit 0
