import type { Env } from "../config/env";
import { reportError } from "../logging/log";
import { executeTurso, intArg, textArg, type Statement, type TursoConfig } from "./tursoClient";

const BUCKET_MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const JOB_METRIC = "job";
const ROLLUP_AGE_DAYS = 30;

const UPSERT_BUCKET =
  "INSERT INTO metrics_bucketed (bucket_minute, metric, count) VALUES (?, ?, ?) ON CONFLICT(bucket_minute, metric) DO UPDATE SET count = count + excluded.count";

export function tursoConfig(env: Env): TursoConfig | null {
  return env.TURSO_URL && env.TURSO_AUTH_TOKEN ? { url: env.TURSO_URL, authToken: env.TURSO_AUTH_TOKEN } : null;
}

const currentBucket = (): number => Math.floor(Date.now() / BUCKET_MINUTE_MS);

const bucketStatement = (metric: string, count: number): Statement => ({
  sql: UPSERT_BUCKET,
  args: [intArg(currentBucket()), textArg(metric), intArg(count)],
});

function queueCounterWrite(ctx: ExecutionContext, env: Env, label: string, statements: Statement[]): void {
  const config = tursoConfig(env);
  if (!config) return;
  ctx.waitUntil(executeTurso(config, statements).catch((error) => reportError(label, error)));
}

export function countCompletedJob(ctx: ExecutionContext, env: Env): void {
  queueCounterWrite(ctx, env, "completed job counter write failed", [
    {
      sql: "INSERT INTO translation_counter (singleton, total) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET total = total + excluded.total",
      args: [intArg(1)],
    },
    bucketStatement(JOB_METRIC, 1),
  ]);
}

export function countJobError(ctx: ExecutionContext, env: Env, errorCode: number): void {
  if (errorCode <= 0) return;
  queueCounterWrite(ctx, env, "job error counter write failed", [bucketStatement(`error_${errorCode}`, 1)]);
}

function addTotal(totals: Map<string, number>, key: string, count: number): void {
  totals.set(key, (totals.get(key) ?? 0) + count);
}

const upsertTotal = (table: string, column: string, key: string, total: number): Statement => ({
  sql: `INSERT INTO ${table} (${column}, total) VALUES (?, ?) ON CONFLICT(${column}) DO UPDATE SET total = total + excluded.total`,
  args: [textArg(key), intArg(total)],
});

export async function rollupAgedTranslationCounters(config: TursoConfig, ageDays: number = ROLLUP_AGE_DAYS): Promise<number> {
  const cutoffMinute = Math.floor((Date.now() - ageDays * DAY_MS) / BUCKET_MINUTE_MS);
  const [rows] = await executeTurso(config, [
    {
      sql: "SELECT bucket_minute, count FROM metrics_bucketed WHERE metric = ? AND bucket_minute < ?",
      args: [textArg(JOB_METRIC), intArg(cutoffMinute)],
    },
  ]);
  if (!rows || rows.length === 0) return 0;

  const daily = new Map<string, number>();
  for (const [bucket, count] of rows as unknown as { value?: string | number }[][]) {
    const date = new Date(Number(bucket?.value ?? 0) * BUCKET_MINUTE_MS).toISOString().slice(0, 10);
    addTotal(daily, date, Number(count?.value ?? 0));
  }

  const monthly = new Map<string, number>();
  const yearly = new Map<string, number>();
  const statements: Statement[] = [];
  for (const [date, total] of daily) {
    statements.push(upsertTotal("translation_daily", "date", date, total));
    addTotal(monthly, date.slice(0, 7), total);
    addTotal(yearly, date.slice(0, 4), total);
  }
  for (const [month, total] of monthly) statements.push(upsertTotal("translation_monthly", "year_month", month, total));
  for (const [year, total] of yearly) statements.push(upsertTotal("translation_yearly", "year", year, total));
  statements.push({
    sql: "DELETE FROM metrics_bucketed WHERE metric = ? AND bucket_minute < ?",
    args: [textArg(JOB_METRIC), intArg(cutoffMinute)],
  });
  await executeTurso(config, statements);
  return rows.length;
}
