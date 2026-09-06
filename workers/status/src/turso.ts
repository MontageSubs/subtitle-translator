import {
  TursoConfig,
  TranslationStats,
  WindowMetrics,
  ComponentHistoryEntry,
} from "./types";
import { logDiagnostic } from "./logger";

export const METRICS_RETENTION_DAYS = 100;

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

export function tursoHealthUrl(rawUrl: string): string {
  return `${tursoOrigin(rawUrl)}/health`;
}

interface Statement {
  sql: string;
  args?: Array<
    | { type: "text" | "integer"; value: string }
    | { type: "float"; value: number }
    | { type: "null" }
  >;
}

async function executePipeline(
  config: TursoConfig,
  statements: Statement[],
): Promise<any> {
  const started = Date.now();
  const url = pipelineUrl(config.url);
  const requests = statements.map((stmt) => ({
    type: "execute",
    stmt: {
      sql: stmt.sql,
      args: stmt.args || [],
    },
  }));
  requests.push({ type: "close" } as any);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  const durationMs = Date.now() - started;
  logDiagnostic(
    "TursoPipeline",
    `Target: ${url} | Statements: ${statements.length} | Status: ${response.status} | Latency: ${durationMs}ms`,
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `turso pipeline failed status ${response.status}: ${detail.slice(0, 300)}`,
    );
  }

  return response.json();
}

export async function initDatabaseSchema(config: TursoConfig): Promise<void> {
  await executePipeline(config, [
    {
      sql: `CREATE TABLE IF NOT EXISTS metrics_bucketed (
        bucket_minute INTEGER NOT NULL,
        metric TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket_minute, metric)
      );`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS translation_counter (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        total INTEGER NOT NULL DEFAULT 0
      );`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS translation_daily (
        date TEXT PRIMARY KEY,
        total INTEGER NOT NULL
      );`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS translation_monthly (
        year_month TEXT PRIMARY KEY,
        total INTEGER NOT NULL
      );`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS translation_yearly (
        year TEXT PRIMARY KEY,
        total INTEGER NOT NULL
      );`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS system_daily_snapshots (
        date TEXT NOT NULL,
        component_id TEXT NOT NULL,
        status TEXT NOT NULL,
        uptime_ratio REAL NOT NULL DEFAULT 100.0,
        total_events INTEGER DEFAULT 0,
        failure_events REAL DEFAULT 0,
        PRIMARY KEY (date, component_id)
      );`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS service_tracking (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        first_seen_date TEXT NOT NULL
      );`,
    },
  ]);
}

export async function ensureTrackingStart(
  config: TursoConfig,
  todayDateStr: string,
): Promise<void> {
  await executePipeline(config, [
    {
      sql: "INSERT INTO service_tracking (singleton, first_seen_date) VALUES (1, ?) ON CONFLICT(singleton) DO NOTHING",
      args: [{ type: "text", value: todayDateStr }],
    },
  ]);
}

export async function readTrackingStart(
  config: TursoConfig,
): Promise<string | null> {
  const result = await executePipeline(config, [
    { sql: "SELECT first_seen_date FROM service_tracking WHERE singleton = 1" },
  ]);
  const value = result?.results?.[0]?.response?.result?.rows?.[0]?.[0]?.value;
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
      args: [
        { type: "text", value: JOB_METRIC },
        { type: "integer", value: String(cutoffMinute) },
      ],
    },
    {
      sql: `SELECT metric, SUM(count) FROM metrics_bucketed WHERE metric LIKE ? ESCAPE ? AND bucket_minute >= ? GROUP BY metric`,
      args: [
        { type: "text", value: ERROR_METRIC_PATTERN },
        { type: "text", value: ERROR_METRIC_ESCAPE },
        { type: "integer", value: String(cutoffMinute) },
      ],
    },
  ]);

  const jobsRow = result?.results?.[0]?.response?.result?.rows?.[0]?.[0];
  const totalJobs = Number(jobsRow?.value ?? 0) || 0;

  const errorRows = result?.results?.[1]?.response?.result?.rows ?? [];
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

export async function readRollingComponentHistory(
  config: TursoConfig,
  componentIds: string[],
  retentionDays: number = METRICS_RETENTION_DAYS,
): Promise<Map<string, ComponentHistoryEntry[]>> {
  const dates: string[] = [];
  const now = new Date();
  for (let i = retentionDays - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    dates.push(d.toISOString().slice(0, 10));
  }

  const startDate = dates[0];
  const result = await executePipeline(config, [
    {
      sql: "SELECT date, component_id, status, uptime_ratio, total_events, failure_events FROM system_daily_snapshots WHERE date >= ? ORDER BY date ASC",
      args: [{ type: "text", value: startDate }],
    },
  ]);

  const rows = result?.results?.[0]?.response?.result?.rows ?? [];
  const snapshotMap = new Map<
    string,
    {
      status: string;
      uptime: number | null;
      totalEvents: number;
      failureEvents: number;
    }
  >();

  for (const row of rows) {
    const date = String(row[0]?.value ?? "");
    const componentId = String(row[1]?.value ?? "");
    const status = String(row[2]?.value ?? "operational");
    const rawUptime = row[3]?.value;
    const uptime =
      status === "nodata" || rawUptime == null ? null : Number(rawUptime);
    const totalEvents = Number(row[4]?.value ?? 0);
    const failureEvents = Number(row[5]?.value ?? 0);
    snapshotMap.set(`${componentId}:${date}`, {
      status,
      uptime,
      totalEvents,
      failureEvents,
    });
  }

  const historyByComponent = new Map<string, ComponentHistoryEntry[]>();
  for (const componentId of componentIds) {
    const entries: ComponentHistoryEntry[] = [];
    for (const date of dates) {
      const recorded = snapshotMap.get(`${componentId}:${date}`);
      if (!recorded) continue;
      entries.push({
        date,
        status: recorded.status as ComponentHistoryEntry["status"],
        uptime:
          recorded.status === "nodata" || recorded.uptime === null
            ? null
            : Number(recorded.uptime.toFixed(2)),
        totalEvents: recorded.totalEvents,
        failureEvents: recorded.failureEvents,
      });
    }
    historyByComponent.set(componentId, entries);
  }

  return historyByComponent;
}

export async function upsertDailySnapshots(
  config: TursoConfig,
  date: string,
  snapshots: Array<{
    componentId: string;
    status: string;
    uptimeRatio: number;
    totalEvents: number;
    failureEvents: number;
  }>,
): Promise<void> {
  if (snapshots.length === 0) return;
  const statements: Statement[] = snapshots.map((s) => ({
    sql: `INSERT INTO system_daily_snapshots (date, component_id, status, uptime_ratio, total_events, failure_events)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, component_id) DO UPDATE SET
            status = excluded.status,
            uptime_ratio = excluded.uptime_ratio,
            total_events = excluded.total_events,
            failure_events = excluded.failure_events`,
    args: [
      { type: "text", value: date },
      { type: "text", value: s.componentId },
      { type: "text", value: s.status },
      { type: "float", value: s.uptimeRatio },
      { type: "integer", value: String(s.totalEvents) },
      { type: "float", value: s.failureEvents },
    ],
  }));

  await executePipeline(config, statements);
}

export async function deleteDailySnapshot(
  config: TursoConfig,
  date: string,
  componentId?: string,
): Promise<void> {
  await executePipeline(config, [
    componentId
      ? {
          sql: "DELETE FROM system_daily_snapshots WHERE date = ? AND component_id = ?",
          args: [
            { type: "text", value: date },
            { type: "text", value: componentId },
          ],
        }
      : {
          sql: "DELETE FROM system_daily_snapshots WHERE date = ?",
          args: [{ type: "text", value: date }],
        },
  ]);
}

export async function readTranslationStats(
  config: TursoConfig,
): Promise<TranslationStats> {
  const dayAgoMinute = minuteFloor(Date.now() - 86_400_000);

  const result = await executePipeline(config, [
    { sql: "SELECT total FROM translation_counter WHERE singleton = 1" },
    {
      sql: "SELECT COALESCE(SUM(count), 0) FROM metrics_bucketed WHERE metric = ? AND bucket_minute >= ?",
      args: [
        { type: "text", value: JOB_METRIC },
        { type: "integer", value: String(dayAgoMinute) },
      ],
    },
  ]);

  const total = Number(
    result?.results?.[0]?.response?.result?.rows?.[0]?.[0]?.value ?? 0,
  );
  const last24h = Number(
    result?.results?.[1]?.response?.result?.rows?.[0]?.[0]?.value ?? 0,
  );

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
      sql: "DELETE FROM system_daily_snapshots WHERE date >= ?",
      args: [{ type: "text", value: cutoffDate }],
    },
    {
      sql: `DELETE FROM metrics_bucketed WHERE metric LIKE ? ESCAPE ? AND bucket_minute >= ?`,
      args: [
        { type: "text", value: ERROR_METRIC_PATTERN },
        { type: "text", value: ERROR_METRIC_ESCAPE },
        { type: "integer", value: String(cutoffMinute) },
      ],
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
      args: [
        { type: "text", value: ERROR_METRIC_PATTERN },
        { type: "text", value: ERROR_METRIC_ESCAPE },
        { type: "integer", value: String(cutoffMinute) },
      ],
    },
    {
      sql: "DELETE FROM system_daily_snapshots WHERE date < ?",
      args: [{ type: "text", value: cutoffDate }],
    },
  ]);
}
