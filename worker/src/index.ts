import { Env, maxBodyBytes } from "./env";
import { json, corsHeaders } from "./response";
import { pruneReputation } from "./reputation";
import { pruneNonceGuard } from "./nonce";
import { pruneRetryTokenGuard } from "./retryTokenGuard";
import { rotateSecret, ROTATION_CRON } from "./rotate";
import { handleHandshake } from "./handlers/handshake";
import { handleTranslateJob } from "./handlers/translateJob";
import { handleTurnstile } from "./handlers/turnstile";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin") || "";
    try {
      const allowed = origin === env.ALLOWED_ORIGIN;

      if (request.method === "OPTIONS") {
        return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
      }
      if (!allowed) return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
      if (request.method !== "POST") return json({ error: "not found" }, 404, origin, env);
      const contentLength = Number(request.headers.get("Content-Length") || "");
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes(env)) {
        return json({ error: "payload too large" }, 413, origin, env);
      }
      if (!env.WORKER_SECRET) return json({ error: "worker misconfigured: WORKER_SECRET is not set" }, 500, origin, env);

      const path = new URL(request.url).pathname;
      if (path === "/handshake") return await handleHandshake(request, env, ctx, origin);
      if (path === "/translate-job") return await handleTranslateJob(request, env, ctx, origin);
      if (path === "/turnstile") return await handleTurnstile(request, env, ctx, origin);
      return json({ error: "not found" }, 404, origin, env);
    } catch (e) {
      return json({ error: `internal error: ${e instanceof Error ? e.message : String(e)}` }, 500, origin, env);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === ROTATION_CRON) {
      ctx.waitUntil(rotateSecret(env));
      return;
    }
    ctx.waitUntil(Promise.all([pruneReputation(env.DB), pruneNonceGuard(env.DB), pruneRetryTokenGuard(env.DB)]));
  },
};
