import type { Env } from "../config/env";
import { pruneReputation } from "../security/reputation";
import { applyDebugLevel } from "../logging/level";
import { reportFault } from "../logging/fault";
import { writeLine } from "../logging/line";
import { rollupAgedTranslationCounters, tursoConfig } from "../counters/jobCounters";
import { syncServiceEndpoints } from "./serviceEndpoints";

const FAILED = "failed";
const SKIPPED = "skipped";

type TaskResult = number | typeof FAILED | typeof SKIPPED;

async function attempt(label: string, task: () => Promise<TaskResult>): Promise<TaskResult> {
  try {
    return await task();
  } catch (error) {
    reportFault(label, error);
    return FAILED;
  }
}

async function pruneExpiredReputation(env: Env): Promise<TaskResult> {
  return pruneReputation(env);
}

async function rollupCounters(env: Env): Promise<TaskResult> {
  const config = tursoConfig(env);
  if (!config) return SKIPPED;
  return rollupAgedTranslationCounters(config);
}

async function runCycle(env: Env): Promise<void> {
  const [pruned, rolled, endpoints] = await Promise.all([
    attempt("reputation_prune_failed", () => pruneExpiredReputation(env)),
    attempt("counter_rollup_failed", () => rollupCounters(env)),
    attempt("service_endpoints_sync_failed", () => syncServiceEndpoints(env)),
  ]);
  const failed = pruned === FAILED || rolled === FAILED || endpoints === FAILED;
  writeLine(failed ? "error" : "log", "cron", failed ? "failed" : "ok", `pruned=${pruned} rolled=${rolled} endpoints=${endpoints}`);
}

export function runScheduledTasks(env: Env, ctx: ExecutionContext): void {
  applyDebugLevel(env.LOG_DEBUG);
  ctx.waitUntil(runCycle(env));
}
