#!/usr/bin/env bash
set -e
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPTS/load-config.sh" turso

NORMALIZED_URL=$(echo "${TURSO_URL}" | sed -E 's|^libsql://|https://|; s|/+$||')
PIPELINE_URL="${NORMALIZED_URL}/v2/pipeline"

CUTOFF_SEC=$(( $(date +%s) - 8640000 ))
CUTOFF_MINUTE=$(( CUTOFF_SEC / 60 ))
CUTOFF_DATE=$(date -d "@${CUTOFF_SEC}" +%Y-%m-%d 2>/dev/null || date -r "${CUTOFF_SEC}" +%Y-%m-%d)


PAYLOAD=$(cat <<EOF
{
  "requests": [
    {
      "type": "execute",
      "stmt": {
        "sql": "CREATE TABLE IF NOT EXISTS metrics_bucketed (bucket_minute INTEGER NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bucket_minute, metric))"
      }
    },
    {
      "type": "execute",
      "stmt": {
        "sql": "CREATE TABLE IF NOT EXISTS history_overrides (date TEXT NOT NULL, component_id TEXT NOT NULL, status TEXT NOT NULL, uptime_ratio REAL, PRIMARY KEY (date, component_id))"
      }
    },
    {
      "type": "execute",
      "stmt": {
        "sql": "DELETE FROM metrics_bucketed WHERE bucket_minute < ?",
        "args": [{"type": "integer", "value": "${CUTOFF_MINUTE}"}]
      }
    },
    {
      "type": "execute",
      "stmt": {
        "sql": "DELETE FROM history_overrides WHERE date < ?",
        "args": [{"type": "text", "value": "${CUTOFF_DATE}"}]
      }
    },
    {"type": "close"}
  ]
}
EOF
)

RESPONSE=$(curl -sS -f -X POST "${PIPELINE_URL}" \
  -H "Authorization: Bearer ${TURSO_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

if echo "${RESPONSE}" | grep -Eq '"type"[[:space:]]*:[[:space:]]*"error"'; then
  echo "Turso pipeline execution returned an error:" >&2
  echo "${RESPONSE}" | bash "$SCRIPTS/sanitize-output.sh" >&2
  exit 1
fi

