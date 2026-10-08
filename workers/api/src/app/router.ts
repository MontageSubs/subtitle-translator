import type { Env } from "../config/env";
import { isAllowedOrigin, settingsFor } from "../config/settings";
import { createContext, elapsedMs, type RequestContext } from "../http/context";
import { corsHeaders, jsonResponse, reject } from "../http/responses";
import { handleHandshake } from "../routes/handshake";
import { handleTranslateJob } from "../routes/translateJob";
import { handleTurnstile } from "../routes/turnstile";
import { MissingClientIpError } from "../security/identity";
import { logHttp, logSecurity, reportError } from "../logging/log";

type RouteHandler = (rc: RequestContext) => Promise<Response>;

const ROUTES: Readonly<Record<string, RouteHandler>> = {
  "/handshake": handleHandshake,
  "/translate-job": handleTranslateJob,
  "/turnstile": handleTurnstile,
};

const notFound = (rc: RequestContext, detail: string): Response => reject(rc, { status: 404, body: { error: "not found" }, detail, ipHash: "none" });

function preflight(rc: RequestContext): Response {
  return new Response(null, { status: 204, headers: corsHeaders(rc.origin) });
}

function guard(rc: RequestContext): Response | null {
  const { env, request, origin } = rc;
  if (!isAllowedOrigin(origin, env)) {
    if (request.method === "OPTIONS") return new Response(null, { status: 403 });
    logSecurity("ORIGIN_BLOCKED", "unknown", `Origin '${origin}' not allowed`);
    return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  if (request.method === "OPTIONS") return preflight(rc);
  if (request.method !== "POST") return notFound(rc, "Method not allowed");

  const contentLength = Number(request.headers.get("Content-Length") || "");
  if (Number.isFinite(contentLength) && contentLength > settingsFor(env).maxBodyBytes) {
    return reject(rc, { status: 413, body: { error: "payload too large" }, detail: `Payload too large (${contentLength} bytes)`, ipHash: "none" });
  }
  if (!env.WORKER_SECRET_A || !env.WORKER_SECRET_B || env.WORKER_SECRET_A === env.WORKER_SECRET_B) {
    logSecurity("MISCONFIGURED", "system", "Worker secret keys missing or identical");
    return jsonResponse(rc, { error: "worker misconfigured" }, 500);
  }
  return null;
}

export async function handleRequest(request: Request, env: Env, ctx: ExecutionContext, workerVersion: string): Promise<Response> {
  const rc = createContext(request, env, ctx, workerVersion);
  try {
    const rejected = guard(rc);
    if (rejected) return rejected;
    const route = ROUTES[rc.path];
    return route ? await route(rc) : notFound(rc, "Route not found");
  } catch (error) {
    reportError("request failed", error);
    const missingIp = error instanceof MissingClientIpError;
    const status = missingIp ? 400 : 500;
    logHttp(request.method, rc.path, status, elapsedMs(rc), "unknown", missingIp ? "Missing client IP" : "Internal server error");
    return jsonResponse(rc, { error: missingIp ? "bad_request" : "internal_error" }, status);
  }
}
