import { Env, tursoConfig } from "../config/env";
import { recordSuccess, recordErrorMetric } from "./turso";
import { reportError } from "../http/response";

export function recordCompletedJob(ctx: ExecutionContext, env: Env): void {
  const config = tursoConfig(env);
  if (!config) return;
  ctx.waitUntil(
    recordSuccess(config, 1).catch((e) =>
      reportError("recordSuccess failed", e),
    ),
  );
}

export function recordJobError(
  ctx: ExecutionContext,
  env: Env,
  errorCode: number,
): void {
  const config = tursoConfig(env);
  if (!config) return;
  ctx.waitUntil(
    recordErrorMetric(config, errorCode, 1).catch((e) =>
      reportError("recordErrorMetric failed", e),
    ),
  );
}
