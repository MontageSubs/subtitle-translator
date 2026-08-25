import { Env, tursoConfig } from "./env";
import { recordSuccess } from "./turso";
import { reportError } from "./response";

export function recordCompletedJob(ctx: ExecutionContext, env: Env): void {
  const config = tursoConfig(env);
  if (!config) return;
  ctx.waitUntil(recordSuccess(config, 1).catch((e) => reportError("recordSuccess failed", e)));
}
