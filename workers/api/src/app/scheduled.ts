import type { Env } from "../config/env";
import { pruneReputation } from "../security/reputation";
import { applyDebugLevel } from "../logging/level";
import { reportFault } from "../logging/fault";
import { writeLine } from "../logging/line";
import { rollupAgedTranslationCounters, tursoConfig } from "../counters/jobCounters";

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
  const startedAt = Date.now();
  const [pruned, rolled] = await Promise.all([attempt("reputation_prune_failed", () => pruneExpiredReputation(env)), attempt("counter_rollup_failed", () => rollupCounters(env))]);
  const failed = pruned === FAILED || rolled === FAILED;
  writeLine(failed ? "error" : "log", "cron", failed ? "failed" : "ok", `ms=${Date.now() - startedAt} pruned=${pruned} rolled=${rolled}`);
}

export function runScheduledTasks(env: Env, ctx: ExecutionContext): void {
  applyDebugLevel(env.DEBUG);
  ctx.waitUntil(runCycle(env));
}
