import {
  CellOverrides,
  HistoryCellStatus,
  TursoConfig,
  TranslationStats,
  WindowMetrics,
  cellOverrideKey,
} from "../types";
import { ErrorCategory, categorizeErrorCode } from "../signals/errorCodes";
import { logDiagnostic } from "../logger";
import { egressFetch } from "../upstream/egress";

const METRICS_RETENTION_DAYS = 100;

export const RECENT_WINDOW_SECONDS = 3600;
export const DAY_WINDOW_SECONDS = 86_400;

const MINUTE_MS = 60_000;
const JOB_METRIC = "job";
const ERROR_METRIC_PATTERN = "error\\_%";
const ERROR_METRIC_ESCAPE = "\\";

function minuteFloor(epochMs: number): number {
  return Math.floor(epochMs / MINUTE_MS);
}

function errorCodeFromMetric(metric: string): number | null {
  const match = /^error_(\d+)$/.exec(metric);
  return match ? Number(match[1]) : null;
}

function tursoOrigin(rawUrl: string): string {
  const normalized = String(rawUrl || "").trim().replace(/^libsql:\/\//, "https://");
  return new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`).origin;
}

function pipelineUrl(rawUrl: string): string {
  return `${tursoOrigin(rawUrl)}/v2/pipeline`;
}

type SqlArg =
  | { type: "text" | "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "null" };

interface Statement {
  sql: string;
  args?: SqlArg[];
}

const textArg = (value: string): SqlArg => ({ type: "text", value });
const integerArg = (value: number): SqlArg => ({ type: "integer", value: String(value) });
const floatArg = (value: number): SqlArg => ({ type: "float", value });

const errorMetricArgs = (): SqlArg[] => [textArg(ERROR_METRIC_PATTERN), textArg(ERROR_METRIC_ESCAPE)];

const rowsOf = (result: any, statementIndex: number): any[] => result?.results?.[statementIndex]?.response?.result?.rows ?? [];

const firstCellValue = (result: any, statementIndex: number): unknown => rowsOf(result, statementIndex)[0]?.[0]?.value;

const PIPELINE_TIMEOUT_MS = 7000;
const PIPELINE_RETRY_DELAY_MS = 800;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientPipelineError = (status: number): boolean =>
  status === 522 || status === 502 || status === 503 || status === 504 || status === 408;

async function executePipeline(
  config: TursoConfig,
  statements: Statement[],
): Promise<any> {
  const url = pipelineUrl(config.url);
  const requests = statements.map((stmt) => ({
    type: "execute",
    stmt: {
      sql: stmt.sql,
      args: stmt.args || [],
    },
  }));
  requests.push({ type: "close" } as any);
  const requestBody = JSON.stringify({ requests });

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await delay(PIPELINE_RETRY_DELAY_MS);
    }
    const started = Date.now();
    try {
      const response = await egressFetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.authToken}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(PIPELINE_TIMEOUT_MS),
      });

      const durationMs = Date.now() - started;
      logDiagnostic(
        "TursoPipeline",
        `Target: ${url} | Statements: ${statements.length} | Status: ${response.status} | Latency: ${durationMs}ms | Attempt: ${attempt + 1}`,
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const error = new Error(`turso pipeline failed status ${response.status}: ${detail.slice(0, 300)}`);
        if (attempt === 0 && isTransientPipelineError(response.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }

      return response.json();
    } catch (err) {
      lastError = err;
      if (attempt === 0) continue;
      throw err;
    }
  }

  throw lastError;
}

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS metrics_bucketed (
        bucket_minute INTEGER NOT NULL,
        metric TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket_minute, metric)
      );`,
  `CREATE TABLE IF NOT EXISTS translation_counter (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        total INTEGER NOT NULL DEFAULT 0
      );`,
  `CREATE TABLE IF NOT EXISTS translation_daily (
        date TEXT PRIMARY KEY,
        total INTEGER NOT NULL
      );`,
  `CREATE TABLE IF NOT EXISTS translation_monthly (
        year_month TEXT PRIMARY KEY,
        total INTEGER NOT NULL
      );`,
  `CREATE TABLE IF NOT EXISTS translation_yearly (
        year TEXT PRIMARY KEY,
        total INTEGER NOT NULL
      );`,
  `CREATE TABLE IF NOT EXISTS history_overrides (
        date TEXT NOT NULL,
        component_id TEXT NOT NULL,
        status TEXT NOT NULL,
        uptime_ratio REAL,
        PRIMARY KEY (date, component_id)
      );`,
  `DROP TABLE IF EXISTS system_daily_snapshots;`,
  `CREATE TABLE IF NOT EXISTS service_tracking (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        first_seen_date TEXT NOT NULL
      );`,
];

export async function initDatabaseSchema(config: TursoConfig): Promise<void> {
  await executePipeline(config, SCHEMA_STATEMENTS.map((sql) => ({ sql })));
}

export async function ensureTrackingStart(
  config: TursoConfig,
  todayDateStr: string,
): Promise<void> {
  await executePipeline(config, [
    {
      sql: "INSERT INTO service_tracking (singleton, first_seen_date) VALUES (1, ?) ON CONFLICT(singleton) DO NOTHING",
      args: [textArg(todayDateStr)],
    },
  ]);
}

export async function readTrackingStart(
  config: TursoConfig,
): Promise<string | null> {
  const result = await executePipeline(config, [
    { sql: "SELECT first_seen_date FROM service_tracking WHERE singleton = 1" },
  ]);
  const value = firstCellValue(result, 0);
  return typeof value === "string" ? value : null;
}

export async function readRecentMetrics(
  config: TursoConfig,
  windowSeconds: number,
): Promise<WindowMetrics> {
  const cutoffMinute = minuteFloor(Date.now() - windowSeconds * 1000);
  const result = await executePipeline(config, [
    {
      sql: "SELECT COALESCE(SUM(count), 0) FROM metrics_bucketed WHERE metric = ? AND bucket_minute >= ?",
      args: [textArg(JOB_METRIC), integerArg(cutoffMinute)],
    },
    {
      sql: `SELECT metric, SUM(count) FROM metrics_bucketed WHERE metric LIKE ? ESCAPE ? AND bucket_minute >= ? GROUP BY metric`,
      args: [...errorMetricArgs(), integerArg(cutoffMinute)],
    },
  ]);

  const totalJobs = Number(firstCellValue(result, 0) ?? 0) || 0;

  const errorRows = rowsOf(result, 1);
  const errorsByCode = new Map<number, number>();
  let totalErrors = 0;

  for (const row of errorRows) {
    const code = errorCodeFromMetric(String(row[0]?.value ?? ""));
    const count = Number(row[1]?.value ?? 0);
    if (code && count > 0) {
      errorsByCode.set(code, count);
      totalErrors += count;
    }
  }

  return { totalJobs, errorsByCode, totalErrors };
}

function listRecentDates(retentionDays: number): string[] {
  const now = new Date();
  return Array.from({ length: retentionDays }, (_, index) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (retentionDays - 1 - index)))
      .toISOString()
      .slice(0, 10),
  );
}

export async function readHistoryOverrides(config: TursoConfig, retentionDays: number): Promise<CellOverrides> {
  const result = await executePipeline(config, [
    {
      sql: "SELECT date, component_id, status, uptime_ratio FROM history_overrides WHERE date >= ?",
      args: [textArg(listRecentDates(retentionDays)[0])],
    },
  ]);
  return new Map(
    rowsOf(result, 0).map((row) => {
      const rawUptime = row[3]?.value;
      return [
        cellOverrideKey(String(row[1]?.value ?? ""), String(row[0]?.value ?? "")),
        {
          status: String(row[2]?.value ?? "operational") as HistoryCellStatus,
          uptime: rawUptime == null ? null : Number(rawUptime),
        },
      ];
    }),
  );
}

export async function upsertHistoryOverride(
  config: TursoConfig,
  override: { date: string; componentId: string; status: HistoryCellStatus; uptime: number | null },
): Promise<void> {
  await executePipeline(config, [
    {
      sql: `INSERT INTO history_overrides (date, component_id, status, uptime_ratio)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(date, component_id) DO UPDATE SET
              status = excluded.status,
              uptime_ratio = excluded.uptime_ratio`,
      args: [
        textArg(override.date),
        textArg(override.componentId),
        textArg(override.status),
        override.uptime === null ? { type: "null" } : floatArg(override.uptime),
      ],
    },
  ]);
}

export async function deleteHistoryOverrides(config: TursoConfig, date: string, componentId?: string): Promise<void> {
  await executePipeline(config, [
    componentId
      ? { sql: "DELETE FROM history_overrides WHERE date = ? AND component_id = ?", args: [textArg(date), textArg(componentId)] }
      : { sql: "DELETE FROM history_overrides WHERE date = ?", args: [textArg(date)] },
  ]);
}

export async function deleteErrorMetrics(
  config: TursoConfig,
  sinceEpochMs: number,
  categories: readonly ErrorCategory[],
): Promise<number> {
  const sinceMinute = minuteFloor(sinceEpochMs);
  const listing = await executePipeline(config, [
    {
      sql: "SELECT DISTINCT metric FROM metrics_bucketed WHERE metric LIKE ? ESCAPE ? AND bucket_minute >= ?",
      args: [...errorMetricArgs(), integerArg(sinceMinute)],
    },
  ]);
  const metrics = rowsOf(listing, 0)
    .map((row) => String(row[0]?.value ?? ""))
    .filter((metric) => {
      const code = errorCodeFromMetric(metric);
      const category = code === null ? null : categorizeErrorCode(code);
      return category !== null && categories.includes(category);
    });
  if (metrics.length === 0) return 0;

  await executePipeline(config, [
    {
      sql: `DELETE FROM metrics_bucketed WHERE bucket_minute >= ? AND metric IN (${metrics.map(() => "?").join(", ")})`,
      args: [integerArg(sinceMinute), ...metrics.map(textArg)],
    },
  ]);
  return metrics.length;
}

export async function readTranslationStats(
  config: TursoConfig,
): Promise<TranslationStats> {
  const dayAgoMinute = minuteFloor(Date.now() - 86_400_000);

  const result = await executePipeline(config, [
    { sql: "SELECT total FROM translation_counter WHERE singleton = 1" },
    {
      sql: "SELECT COALESCE(SUM(count), 0) FROM metrics_bucketed WHERE metric = ? AND bucket_minute >= ?",
      args: [textArg(JOB_METRIC), integerArg(dayAgoMinute)],
    },
  ]);

  const total = Number(firstCellValue(result, 0) ?? 0);
  const last24h = Number(firstCellValue(result, 1) ?? 0);

  return { total, last24h, updatedAt: Date.now() };
}

export async function purgeRecentData(
  config: TursoConfig,
  days: number,
): Promise<{ cutoffDate: string; cutoffSec: number }> {
  const cutoffSec = Math.floor(Date.now() / 1000) - days * 86400;
  const cutoffMinute = Math.floor(cutoffSec / 60);
  const cutoffDate = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);

  await executePipeline(config, [
    {
      sql: "DELETE FROM history_overrides WHERE date >= ?",
      args: [textArg(cutoffDate)],
    },
    {
      sql: `DELETE FROM metrics_bucketed WHERE metric LIKE ? ESCAPE ? AND bucket_minute >= ?`,
      args: [...errorMetricArgs(), integerArg(cutoffMinute)],
    },
  ]);

  return { cutoffDate, cutoffSec };
}

export async function pruneExpiredMetrics(
  config: TursoConfig,
  retentionDays: number = METRICS_RETENTION_DAYS,
): Promise<void> {
  const cutoffMs = Date.now() - retentionDays * 86_400_000;
  const cutoffMinute = minuteFloor(cutoffMs);
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);

  await executePipeline(config, [
    {
      sql: `DELETE FROM metrics_bucketed WHERE metric LIKE ? ESCAPE ? AND bucket_minute < ?`,
      args: [...errorMetricArgs(), integerArg(cutoffMinute)],
    },
    {
      sql: "DELETE FROM history_overrides WHERE date < ?",
      args: [textArg(cutoffDate)],
    },
  ]);
}
