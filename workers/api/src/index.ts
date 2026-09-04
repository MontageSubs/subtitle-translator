import { Env, maxBodyBytes, isAllowedOrigin } from './config/env';
import { json, corsHeaders } from './http/response';
import { pruneReputation } from './security/reputation';
import { handleHandshake } from "./handlers/handshake";
import { handleTranslateJob } from "./handlers/translateJob";
import { handleTurnstile } from "./handlers/turnstile";
import { logHttp, logSecurity, logCron } from "./core/log";

export const WORKER_VERSION = "0.0.17-beta";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startedAt = Date.now();
    const origin = request.headers.get("Origin") || "";
    const path = new URL(request.url).pathname;

    try {
      const allowed = isAllowedOrigin(origin, env);

      if (request.method === "OPTIONS") {
        return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
      }
      if (!allowed) {
        logSecurity("ORIGIN_BLOCKED", "unknown", `Origin '${origin}' not allowed`);
        return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      if (request.method !== "POST") {
        logHttp(request.method, path, 404, Date.now() - startedAt, "none", "Method not allowed");
        return json({ error: "not found" }, 404, origin, env);
      }
      const contentLength = Number(request.headers.get("Content-Length") || "");
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes(env)) {
        logHttp(request.method, path, 413, Date.now() - startedAt, "none", `Payload too large (${contentLength} bytes)`);
        return json({ error: "payload too large" }, 413, origin, env);
      }
      if (!env.WORKER_SECRET_A || !env.WORKER_SECRET_B || env.WORKER_SECRET_A === env.WORKER_SECRET_B) {
        logSecurity("MISCONFIGURED", "system", "Worker secret keys missing or identical");
        return json({ error: "worker misconfigured" }, 500, origin, env);
      }

      if (path === "/handshake") return await handleHandshake(request, env, ctx, origin);
      if (path === "/translate-job") return await handleTranslateJob(request, env, ctx, origin);
      if (path === "/turnstile") return await handleTurnstile(request, env, ctx, origin);

      logHttp(request.method, path, 404, Date.now() - startedAt, "none", "Route not found");
      return json({ error: "not found" }, 404, origin, env);
    } catch (e) {
      console.error(e);
      const isMissingIp = e instanceof Error && e.message === "missing_client_ip";
      logHttp(request.method, path, isMissingIp ? 400 : 500, Date.now() - startedAt, "unknown", isMissingIp ? "Missing client IP" : "Internal server error");
      return json({ error: isMissingIp ? "bad_request" : "internal_error" }, isMissingIp ? 400 : 500, origin, env);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        logCron("pruneReputation", "Starting scheduled cleanup of expired D1 ip_shield records...");
        const count = await pruneReputation(env.DB);
        logCron("pruneReputation", `Successfully cleaned ${count} expired IP reputation records from D1 ip_shield table`);
      })()
    );
  },
};
