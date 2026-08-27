export interface TursoConfig {
  url: string;
  authToken: string;
}

export interface Stats {
  total: number;
  last24h: number;
}

const BUCKET_MS = 3_600_000;

const SCHEMA_STATEMENTS: { sql: string; args?: number[] }[] = [
  { sql: "CREATE TABLE IF NOT EXISTS translation_stats_hourly (bucket_start INTEGER PRIMARY KEY, count INTEGER NOT NULL)" },
];

function pipelineUrl(rawUrl: string): string {
  return `${rawUrl.trim().replace(/^libsql:\/\//, "https://").replace(/\/+$/, "")}/v2/pipeline`;
}

async function execute(config: TursoConfig, statements: { sql: string; args?: number[] }[]): Promise<any> {
  const response = await fetch(pipelineUrl(config.url), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.authToken}`, "Content-Type": "application/json" },
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

function extractScalar(result: any, index: number): number {
  const row = result?.results?.[SCHEMA_STATEMENTS.length + index]?.response?.result?.rows?.[0]?.[0];
  return Number(row?.value ?? 0) || 0;
}

export async function recordSuccess(config: TursoConfig, count: number): Promise<void> {
  if (count <= 0) return;
  const bucketStart = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
  await execute(config, [{
    sql: "INSERT INTO translation_stats_hourly (bucket_start, count) VALUES (?, ?) ON CONFLICT(bucket_start) DO UPDATE SET count = count + excluded.count",
    args: [bucketStart, count],
  }]);
}

export async function readStats(config: TursoConfig): Promise<Stats> {
  const dayAgoBucket = Math.floor((Date.now() - 86_400_000) / BUCKET_MS) * BUCKET_MS;
  const result = await execute(config, [
    { sql: "SELECT COALESCE(SUM(count),0) FROM translation_stats_hourly" },
    { sql: "SELECT COALESCE(SUM(count),0) FROM translation_stats_hourly WHERE bucket_start > ?", args: [dayAgoBucket] },
  ]);
  return { total: extractScalar(result, 0), last24h: extractScalar(result, 1) };
}
