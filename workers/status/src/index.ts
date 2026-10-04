import { Env } from "./config";
import { resolveAdminRequest } from "./admin/routes";
import { executeAdminAction } from "./admin/execute";
import { runStatusCycle } from "./cycle/run";
import { jsonResponse, notFoundResponse } from "./http";
import { logSystemError } from "./logger";

export type { Env } from "./config";

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await runStatusCycle(env, ctx);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const resolution = await resolveAdminRequest(request, env.ADMIN_API_SECRET);
    if (!resolution) return notFoundResponse();
    if ("response" in resolution) return resolution.response;

    return executeAdminAction(resolution.action, env, ctx).catch((error) => {
      logSystemError("AdminAction", error);
      return jsonResponse(500, { success: false, error: "internal error" });
    });
  },
};
