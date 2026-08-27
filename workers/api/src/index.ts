import { Env, maxBodyBytes } from './config/env';
import { json, corsHeaders } from './http/response';
import { pruneReputation } from './security/reputation';
import { pruneNonceGuard } from './security/nonce';
import { pruneRetryTokenGuard } from './security/retryTokenGuard';
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
      if (!env.WORKER_SECRET_A && !env.WORKER_SECRET_B) return json({ error: "worker misconfigured: WORKER_SECRET_A/B are not set" }, 500, origin, env);

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
    ctx.waitUntil(Promise.all([pruneReputation(env.DB), pruneNonceGuard(env.DB), pruneRetryTokenGuard(env.DB)]));
  },
};
