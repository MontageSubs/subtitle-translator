export interface TursoConfig {
  url: string;
  authToken: string;
}

export interface Stats {
  total: number;
  last24h: number;
}

const BUCKET_MS = 3_600_000;
const BUCKET_SEC = 3600;

const SCHEMA_STATEMENTS: { sql: string; args?: number[] }[] = [
  {
    sql: "CREATE TABLE IF NOT EXISTS translation_stats_hourly (bucket_start INTEGER PRIMARY KEY, count INTEGER NOT NULL)",
  },
  {
    sql: "CREATE TABLE IF NOT EXISTS metric_jobs_bucketed (bucket_start INTEGER NOT NULL, bucket_duration INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bucket_start, bucket_duration))",
  },
  {
    sql: "CREATE TABLE IF NOT EXISTS metric_errors_bucketed (bucket_start INTEGER NOT NULL, bucket_duration INTEGER NOT NULL, error_code INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bucket_start, bucket_duration, error_code))",
  },
];

function pipelineUrl(rawUrl: string): string {
  return `${rawUrl
    .trim()
    .replace(/^libsql:\/\//, "https://")
    .replace(/\/+$/, "")}/v2/pipeline`;
}

async function execute(
  config: TursoConfig,
  statements: { sql: string; args?: number[] }[],
): Promise<any> {
  const response = await fetch(pipelineUrl(config.url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        ...[...SCHEMA_STATEMENTS, ...statements].map((stmt) => ({
          type: "execute",
          stmt: {
            sql: stmt.sql,
            args: (stmt.args || []).map((value) => ({
              type: "integer",
              value: String(value),
            })),
          },
        })),
        { type: "close" },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `turso responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return response.json();
}

function extractScalar(result: any, index: number): number {
  const row =
    result?.results?.[SCHEMA_STATEMENTS.length + index]?.response?.result
      ?.rows?.[0]?.[0];
  return Number(row?.value ?? 0) || 0;
}

export async function recordSuccess(
  config: TursoConfig,
  count: number,
): Promise<void> {
  if (count <= 0) return;
  const now = Date.now();
  const bucketStartMs = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  const bucketStartSec = Math.floor(now / 1000 / BUCKET_SEC) * BUCKET_SEC;

  await execute(config, [
    {
      sql: "INSERT INTO translation_stats_hourly (bucket_start, count) VALUES (?, ?) ON CONFLICT(bucket_start) DO UPDATE SET count = count + excluded.count",
      args: [bucketStartMs, count],
    },
    {
      sql: "INSERT INTO metric_jobs_bucketed (bucket_start, bucket_duration, count) VALUES (?, ?, ?) ON CONFLICT(bucket_start, bucket_duration) DO UPDATE SET count = count + excluded.count",
      args: [bucketStartSec, BUCKET_SEC, count],
    },
  ]);
}

export async function recordErrorMetric(
  config: TursoConfig,
  errorCode: number,
  count: number = 1,
): Promise<void> {
  if (count <= 0 || errorCode <= 0) return;
  const bucketStartSec =
    Math.floor(Date.now() / 1000 / BUCKET_SEC) * BUCKET_SEC;

  await execute(config, [
    {
      sql: "INSERT INTO metric_errors_bucketed (bucket_start, bucket_duration, error_code, count) VALUES (?, ?, ?, ?) ON CONFLICT(bucket_start, bucket_duration, error_code) DO UPDATE SET count = count + excluded.count",
      args: [bucketStartSec, BUCKET_SEC, errorCode, count],
    },
  ]);
}

export async function readStats(config: TursoConfig): Promise<Stats> {
  const dayAgoBucket =
    Math.floor((Date.now() - 86_400_000) / BUCKET_MS) * BUCKET_MS;
  const result = await execute(config, [
    { sql: "SELECT COALESCE(SUM(count),0) FROM translation_stats_hourly" },
    {
      sql: "SELECT COALESCE(SUM(count),0) FROM translation_stats_hourly WHERE bucket_start > ?",
      args: [dayAgoBucket],
    },
  ]);
  return { total: extractScalar(result, 0), last24h: extractScalar(result, 1) };
}
