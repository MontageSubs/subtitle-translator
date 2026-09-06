export interface TursoConfig {
  url: string;
  authToken: string;
}

type StatementArg = { type: "text" | "integer"; value: string };

interface Statement {
  sql: string;
  args?: StatementArg[];
}

const BUCKET_MINUTE_MS = 60_000;
const JOB_METRIC = "job";
const ROLLUP_AGE_DAYS = 30;

const errorMetric = (errorCode: number): string => `error_${errorCode}`;
const intArg = (value: number): StatementArg => ({ type: "integer", value: String(value) });
const textArg = (value: string): StatementArg => ({ type: "text", value });

const SCHEMA_STATEMENTS: Statement[] = [
  {
    sql: "CREATE TABLE IF NOT EXISTS translation_counter (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), total INTEGER NOT NULL DEFAULT 0)",
  },
  {
    sql: "CREATE TABLE IF NOT EXISTS metrics_bucketed (bucket_minute INTEGER NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bucket_minute, metric))",
  },
  {
    sql: "CREATE TABLE IF NOT EXISTS translation_daily (date TEXT PRIMARY KEY, total INTEGER NOT NULL)",
  },
  {
    sql: "CREATE TABLE IF NOT EXISTS translation_monthly (year_month TEXT PRIMARY KEY, total INTEGER NOT NULL)",
  },
  {
    sql: "CREATE TABLE IF NOT EXISTS translation_yearly (year TEXT PRIMARY KEY, total INTEGER NOT NULL)",
  },
];

function pipelineUrl(rawUrl: string): string {
  return `${rawUrl
    .trim()
    .replace(/^libsql:\/\//, "https://")
    .replace(/\/+$/, "")}/v2/pipeline`;
}

async function execute(config: TursoConfig, statements: Statement[]): Promise<any> {
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
          stmt: { sql: stmt.sql, args: stmt.args || [] },
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

export async function recordSuccess(
  config: TursoConfig,
  count: number,
): Promise<void> {
  if (count <= 0) return;
  const bucketMinute = Math.floor(Date.now() / BUCKET_MINUTE_MS);

  await execute(config, [
    {
      sql: "INSERT INTO translation_counter (singleton, total) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET total = total + excluded.total",
      args: [intArg(count)],
    },
    {
      sql: "INSERT INTO metrics_bucketed (bucket_minute, metric, count) VALUES (?, ?, ?) ON CONFLICT(bucket_minute, metric) DO UPDATE SET count = count + excluded.count",
      args: [intArg(bucketMinute), textArg(JOB_METRIC), intArg(count)],
    },
  ]);
}

export async function recordErrorMetric(
  config: TursoConfig,
  errorCode: number,
  count: number = 1,
): Promise<void> {
  if (count <= 0 || errorCode <= 0) return;
  const bucketMinute = Math.floor(Date.now() / BUCKET_MINUTE_MS);

  await execute(config, [
    {
      sql: "INSERT INTO metrics_bucketed (bucket_minute, metric, count) VALUES (?, ?, ?) ON CONFLICT(bucket_minute, metric) DO UPDATE SET count = count + excluded.count",
      args: [intArg(bucketMinute), textArg(errorMetric(errorCode)), intArg(count)],
    },
  ]);
}

export async function rollupAgedTranslationCounters(
  config: TursoConfig,
  ageDays: number = ROLLUP_AGE_DAYS,
): Promise<number> {
  const cutoffMinute = Math.floor((Date.now() - ageDays * 86_400_000) / BUCKET_MINUTE_MS);

  const selection = await execute(config, [
    {
      sql: "SELECT bucket_minute, count FROM metrics_bucketed WHERE metric = ? AND bucket_minute < ?",
      args: [textArg(JOB_METRIC), intArg(cutoffMinute)],
    },
  ]);

  const rows = selection?.results?.[SCHEMA_STATEMENTS.length]?.response?.result?.rows ?? [];
  if (rows.length === 0) return 0;

  const dailyTotals = new Map<string, number>();
  for (const row of rows) {
    const bucketMinute = Number(row[0]?.value ?? 0);
    const count = Number(row[1]?.value ?? 0);
    const date = new Date(bucketMinute * BUCKET_MINUTE_MS).toISOString().slice(0, 10);
    dailyTotals.set(date, (dailyTotals.get(date) || 0) + count);
  }

  const upsertStatements: Statement[] = [];
  const monthlyTotals = new Map<string, number>();
  const yearlyTotals = new Map<string, number>();

  for (const [date, total] of dailyTotals) {
    upsertStatements.push({
      sql: "INSERT INTO translation_daily (date, total) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET total = total + excluded.total",
      args: [textArg(date), intArg(total)],
    });
    const yearMonth = date.slice(0, 7);
    const year = date.slice(0, 4);
    monthlyTotals.set(yearMonth, (monthlyTotals.get(yearMonth) || 0) + total);
    yearlyTotals.set(year, (yearlyTotals.get(year) || 0) + total);
  }

  for (const [yearMonth, total] of monthlyTotals) {
    upsertStatements.push({
      sql: "INSERT INTO translation_monthly (year_month, total) VALUES (?, ?) ON CONFLICT(year_month) DO UPDATE SET total = total + excluded.total",
      args: [textArg(yearMonth), intArg(total)],
    });
  }
  for (const [year, total] of yearlyTotals) {
    upsertStatements.push({
      sql: "INSERT INTO translation_yearly (year, total) VALUES (?, ?) ON CONFLICT(year) DO UPDATE SET total = total + excluded.total",
      args: [textArg(year), intArg(total)],
    });
  }

  upsertStatements.push({
    sql: "DELETE FROM metrics_bucketed WHERE metric = ? AND bucket_minute < ?",
    args: [textArg(JOB_METRIC), intArg(cutoffMinute)],
  });

  await execute(config, upsertStatements);
  return rows.length;
}
