import { WORKER_VERSION } from "./version";
import type { Env } from "./config/env";
import { handleRequest } from "./app/router";
import { runScheduledTasks } from "./app/scheduled";

export default {
  fetch: (request, env, ctx) => handleRequest(request, env, ctx, WORKER_VERSION),

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    runScheduledTasks(env, ctx);
  },
} satisfies ExportedHandler<Env>;
