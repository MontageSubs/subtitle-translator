import type { Env } from "../config/env";
import { pruneReputation } from "../security/reputation";
import { applyDebugLevel } from "../logging/level";
import { reportFault } from "../logging/fault";
import { logNotice, trace } from "../logging/trace";
import { rollupAgedTranslationCounters, tursoConfig } from "../counters/jobCounters";

async function pruneExpiredReputation(env: Env): Promise<void> {
  trace(1, "cron", "pruneReputation", "Starting scheduled cleanup of expired D1 ip_shield records...");
  const count = await pruneReputation(env);
  logNotice("cron", `pruneReputation: cleaned ${count} expired IP reputation record(s)`);
}

async function rollupCounters(env: Env): Promise<void> {
  const config = tursoConfig(env);
  if (!config) return;
  trace(1, "cron", "rollupTranslationCounters", "Starting scheduled rollup of aged Turso translation counters...");
  const rolled = await rollupAgedTranslationCounters(config).catch((error) => {
    reportFault("rollupTranslationCounters failed", error);
    return null;
  });
  if (rolled !== null) logNotice("cron", `rollupTranslationCounters: rolled up ${rolled} aged minute-bucket row(s)`);
}

export function runScheduledTasks(env: Env, ctx: ExecutionContext): void {
  applyDebugLevel(env.DEBUG);
  ctx.waitUntil(pruneExpiredReputation(env));
  ctx.waitUntil(rollupCounters(env));
}
