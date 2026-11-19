import type { Env } from "../config/env";
import { pruneSeals } from "../security/clientSeal/prune";
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
  const [pruned, sealsPruned, rolled, endpoints] = await Promise.all([
    attempt("reputation_prune_failed", () => pruneExpiredReputation(env)),
    attempt("seal_prune_failed", () => pruneSeals(env)),
    attempt("counter_rollup_failed", () => rollupCounters(env)),
    attempt("service_endpoints_sync_failed", () => syncServiceEndpoints(env)),
  ]);
  const failed = pruned === FAILED || sealsPruned === FAILED || rolled === FAILED || endpoints === FAILED;
  writeLine(failed ? "error" : "log", "cron", failed ? "failed" : "ok", `pruned=${pruned} seals=${sealsPruned} rolled=${rolled} endpoints=${endpoints}`);
}

export function runScheduledTasks(env: Env, ctx: ExecutionContext): void {
  applyDebugLevel(env.LOG_DEBUG);
  ctx.waitUntil(runCycle(env));
}
