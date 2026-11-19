import type { Env } from "../config/env";
import { applyDebugLevel } from "../logging/level";
import { reportFault } from "../logging/fault";
import { writeLine } from "../logging/line";
import { rollupAgedTranslationCounters, tursoConfig } from "../counters/jobCounters";
import { runD1Maintenance } from "./maintenance";

const FAILED = "failed";
const SKIPPED = "skipped";

type TaskResult = number | typeof FAILED | typeof SKIPPED;

async function attempt<T>(label: string, task: () => Promise<T>): Promise<T | typeof FAILED> {
  try {
    return await task();
  } catch (error) {
    reportFault(label, error);
    return FAILED;
  }
}

async function rollupCounters(env: Env): Promise<TaskResult> {
  const config = tursoConfig(env);
  return config ? rollupAgedTranslationCounters(config) : SKIPPED;
}

async function runCycle(env: Env): Promise<void> {
  const [maintenance, rolled] = await Promise.all([
    attempt("d1_maintenance_failed", () => runD1Maintenance(env)),
    attempt("counter_rollup_failed", () => rollupCounters(env)),
  ]);
  const failed = maintenance === FAILED || rolled === FAILED;
  const { pruned, seals, endpoints } = maintenance === FAILED ? { pruned: FAILED, seals: FAILED, endpoints: FAILED } : maintenance;
  writeLine(failed ? "error" : "log", "cron", failed ? "failed" : "ok", `pruned=${pruned} seals=${seals} rolled=${rolled} endpoints=${endpoints}`);
}

export function runScheduledTasks(env: Env, ctx: ExecutionContext): void {
  applyDebugLevel(env.LOG_DEBUG);
  ctx.waitUntil(runCycle(env));
}
