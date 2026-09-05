import {
  TursoConfig,
  LegacyStats,
  WindowMetrics,
  ComponentHistoryEntry,
} from "./types";

const BUCKET_DURATION_SECONDS = 3600;

// Deriving from the URL's origin (rather than trimming trailing slashes off the raw
// string) makes both endpoints resilient to a configured value that already carries a
// path -- e.g. a pipeline URL saved where a bare host was expected would otherwise
// produce something like ".../v2/pipeline/health", which Turso routes to the
// JWT-guarded query handler instead of the public health check, surfacing as a
// misleading 401 rather than the real misconfiguration.
function tursoOrigin(rawUrl: string): string {
  const normalized = rawUrl.trim().replace(/^libsql:\/\//, "https://");
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
  const requests = statements.map((stmt) => ({
    type: "execute",
    stmt: {
      sql: stmt.sql,
      args: stmt.args || [],
    },
  }));
  requests.push({ type: "close" } as any);

  const response = await fetch(pipelineUrl(config.url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `turso pipeline failed status ${response.status}: ${detail.slice(0, 300)}`,
    );
  }

  const result = (await response.json()) as any;
  return result;
}

export async function initDatabaseSchema(config: TursoConfig): Promise<void> {
  await executePipeline(config, [
    {
      sql: `CREATE TABLE IF NOT EXISTS metric_jobs_bucketed (
        bucket_start INTEGER NOT NULL,
        bucket_duration INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket_start, bucket_duration)
      );`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS metric_errors_bucketed (
        bucket_start INTEGER NOT NULL,
        bucket_duration INTEGER NOT NULL,
        error_code INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket_start, bucket_duration, error_code)
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
      sql: `CREATE TABLE IF NOT EXISTS translation_stats_hourly (
        bucket_start INTEGER PRIMARY KEY,
        count INTEGER NOT NULL
      );`,
    },
  ]);
}

export async function readRecentMetrics(
  config: TursoConfig,
  windowSeconds: number,
): Promise<WindowMetrics> {
  const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
  const result = await executePipeline(config, [
    {
      sql: "SELECT COALESCE(SUM(count), 0) FROM metric_jobs_bucketed WHERE bucket_start >= ?",
      args: [{ type: "integer", value: String(cutoff) }],
    },
    {
      sql: "SELECT error_code, SUM(count) FROM metric_errors_bucketed WHERE bucket_start >= ? GROUP BY error_code",
      args: [{ type: "integer", value: String(cutoff) }],
    },
  ]);

  const jobsRow = result?.results?.[0]?.response?.result?.rows?.[0]?.[0];
  const totalJobs = Number(jobsRow?.value ?? 0) || 0;

  const errorRows = result?.results?.[1]?.response?.result?.rows ?? [];
  const errorsByCode = new Map<number, number>();
  let totalErrors = 0;

  for (const row of errorRows) {
    const code = Number(row[0]?.value ?? 0);
    const count = Number(row[1]?.value ?? 0);
    if (code > 0 && count > 0) {
      errorsByCode.set(code, count);
      totalErrors += count;
    }
  }

  return { totalJobs, errorsByCode, totalErrors };
}

export async function readRollingComponentHistory(
  config: TursoConfig,
  componentIds: string[],
  retentionDays: number = 90,
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
      uptime: number;
      totalEvents: number;
      failureEvents: number;
    }
  >();

  for (const row of rows) {
    const date = String(row[0]?.value ?? "");
    const componentId = String(row[1]?.value ?? "");
    const status = String(row[2]?.value ?? "operational");
    const uptime = Number(row[3]?.value ?? 100);
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
        uptime: Number(recorded.uptime.toFixed(2)),
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

export async function readLegacyStats(
  config: TursoConfig,
): Promise<LegacyStats> {
  const dayAgoSec = Math.floor(Date.now() / 1000) - 86400;
  const dayAgoMs =
    Math.floor((Date.now() - 86400000) / (BUCKET_DURATION_SECONDS * 1000)) *
    (BUCKET_DURATION_SECONDS * 1000);

  const result = await executePipeline(config, [
    { sql: "SELECT COALESCE(SUM(count), 0) FROM metric_jobs_bucketed" },
    {
      sql: "SELECT COALESCE(SUM(count), 0) FROM metric_jobs_bucketed WHERE bucket_start >= ?",
      args: [{ type: "integer", value: String(dayAgoSec) }],
    },
    { sql: "SELECT COALESCE(SUM(count), 0) FROM translation_stats_hourly" },
    {
      sql: "SELECT COALESCE(SUM(count), 0) FROM translation_stats_hourly WHERE bucket_start > ?",
      args: [{ type: "integer", value: String(dayAgoMs) }],
    },
  ]);

  const bucketTotal = Number(
    result?.results?.[0]?.response?.result?.rows?.[0]?.[0]?.value ?? 0,
  );
  const bucket24h = Number(
    result?.results?.[1]?.response?.result?.rows?.[0]?.[0]?.value ?? 0,
  );
  const legacyTotal = Number(
    result?.results?.[2]?.response?.result?.rows?.[0]?.[0]?.value ?? 0,
  );
  const legacy24h = Number(
    result?.results?.[3]?.response?.result?.rows?.[0]?.[0]?.value ?? 0,
  );

  const total = Math.max(bucketTotal, legacyTotal);
  const last24h = Math.max(bucket24h, legacy24h);

  return { total, last24h, updatedAt: Date.now() };
}

export async function pruneOldRetentionMetrics(
  config: TursoConfig,
  retentionSeconds: number = 8640000,
): Promise<void> {
  const cutoffSec = Math.floor(Date.now() / 1000) - retentionSeconds;
  const cutoffDate = new Date(Date.now() - retentionSeconds * 1000)
    .toISOString()
    .slice(0, 10);

  await executePipeline(config, [
    {
      sql: "DELETE FROM metric_jobs_bucketed WHERE bucket_start < ?",
      args: [{ type: "integer", value: String(cutoffSec) }],
    },
    {
      sql: "DELETE FROM metric_errors_bucketed WHERE bucket_start < ?",
      args: [{ type: "integer", value: String(cutoffSec) }],
    },
    {
      sql: "DELETE FROM system_daily_snapshots WHERE date < ?",
      args: [{ type: "text", value: cutoffDate }],
    },
  ]);
}
