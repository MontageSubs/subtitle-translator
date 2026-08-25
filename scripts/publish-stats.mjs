import { writeFileSync, mkdirSync } from "node:fs";

const BUCKET_MS = 3_600_000;
const SCHEMA_STATEMENTS = [
  { sql: "CREATE TABLE IF NOT EXISTS translation_stats_hourly (bucket_start INTEGER PRIMARY KEY, count INTEGER NOT NULL)" },
];

function pipelineUrl(rawUrl) {
  return `${rawUrl.trim().replace(/^libsql:\/\//, "https://").replace(/\/+$/, "")}/v2/pipeline`;
}

function extractScalar(result, index) {
  const row = result?.results?.[SCHEMA_STATEMENTS.length + index]?.response?.result?.rows?.[0]?.[0];
  return Number(row?.value ?? 0) || 0;
}

async function execute(url, authToken, statements) {
  const response = await fetch(pipelineUrl(url), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        ...[...SCHEMA_STATEMENTS, ...statements].map((stmt) => ({
          type: "execute",
          stmt: { sql: stmt.sql, args: (stmt.args || []).map((value) => ({ type: "integer", value: String(value) })) },
        })),
        { type: "close" },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`turso responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return response.json();
}

async function main() {
  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error("TURSO_URL / TURSO_AUTH_TOKEN not set");

  const dayAgoBucket = Math.floor((Date.now() - 86_400_000) / BUCKET_MS) * BUCKET_MS;
  const result = await execute(url, authToken, [
    { sql: "SELECT COALESCE(SUM(count),0) FROM translation_stats_hourly" },
    { sql: "SELECT COALESCE(SUM(count),0) FROM translation_stats_hourly WHERE bucket_start > ?", args: [dayAgoBucket] },
  ]);

  const stats = { total: extractScalar(result, 0), last24h: extractScalar(result, 1), updatedAt: Date.now() };
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/stats.json", JSON.stringify(stats));
  writeFileSync(
    "dist/_headers",
    "/stats.json\n  Access-Control-Allow-Origin: https://subs.js.org\n  Cache-Control: public, max-age=300\n"
  );
  console.log("published", stats);
}

main().catch((e) => { console.error(e); process.exit(1); });
