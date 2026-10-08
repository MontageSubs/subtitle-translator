import type { Env } from "../config/env";
import { pruneReputation } from "../security/reputation";
import { errorMessage, logCron } from "../telemetry/log";
import { rollupAgedTranslationCounters, tursoConfig } from "../telemetry/metrics";

async function pruneExpiredReputation(env: Env): Promise<void> {
  logCron("pruneReputation", "Starting scheduled cleanup of expired D1 ip_shield records...");
  const count = await pruneReputation(env);
  logCron("pruneReputation", `Successfully cleaned ${count} expired IP reputation records from D1 ip_shield table`);
}

async function rollupCounters(env: Env): Promise<void> {
  const config = tursoConfig(env);
  if (!config) return;
  logCron("rollupTranslationCounters", "Starting scheduled rollup of aged Turso translation counters...");
  const rolled = await rollupAgedTranslationCounters(config).catch((error) => {
    logCron("rollupTranslationCounters", `Rollup failed: ${errorMessage(error)}`);
    return 0;
  });
  logCron("rollupTranslationCounters", `Rolled up ${rolled} aged minute-bucket row(s) into daily/monthly/yearly totals`);
}

export function runScheduledTasks(env: Env, ctx: ExecutionContext): void {
  ctx.waitUntil(pruneExpiredReputation(env));
  ctx.waitUntil(rollupCounters(env));
}
