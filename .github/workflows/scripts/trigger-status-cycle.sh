#!/usr/bin/env bash
set -u

WORKER_URL="$(echo "${WORKER_URL:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
[ -n "$WORKER_URL" ] && echo "::add-mask::$WORKER_URL"
[ -n "${TOKEN:-}" ] && echo "::add-mask::$TOKEN"

if [ -z "$WORKER_URL" ]; then
  echo "No status worker URL configured, skipping status cycle trigger."
  exit 0
fi

[[ "$WORKER_URL" == http*://* ]] || WORKER_URL="https://$WORKER_URL"

echo "Triggering status cycle..."
HTTP_CODE=$(curl -sS -o /tmp/trigger_response.json -w "%{http_code}" -X POST "${WORKER_URL%/}/api/admin/cycle/trigger" \
  -A "MontageSubs-Status/1.0" \
  -H "X-Gateway-Automation-Token: ${TOKEN:-}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"full"}' || echo "000")

echo "Trigger HTTP status code: $HTTP_CODE"
[ -f /tmp/trigger_response.json ] && cat /tmp/trigger_response.json && echo ""
[[ "$HTTP_CODE" == 2* ]] || echo "Trigger notice: worker will execute on next cron schedule"
exit 0
