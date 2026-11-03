import type { Env } from "../config/env";
import { ConfigError, isAllowedOrigin, settingsFor } from "../config/settings";
import { createContext, type RequestContext } from "../http/context";
import { corsHeaders, jsonResponse, reject } from "../http/responses";
import { handleClearance } from "../routes/clearance";
import { handleSession } from "../routes/session";
import { handleTermTranslations } from "../routes/termTranslations";
import { handleTranslations } from "../routes/translations";
import { MissingClientIpError } from "../security/identity";
import { applyDebugLevel } from "../logging/level";
import { describeError } from "../logging/fault";
import { logRequest } from "../logging/requestLog";

type RouteHandler = (rc: RequestContext) => Promise<Response>;

interface Route {
  endpoint: string;
  handle: RouteHandler;
}

const MAX_LOGGED_ORIGIN_CHARS = 100;

const ROUTES: Readonly<Record<string, Route>> = {
  "/session": { endpoint: "session", handle: handleSession },
  "/translations": { endpoint: "translations", handle: handleTranslations },
  "/term-translations": { endpoint: "term-translations", handle: handleTermTranslations },
  "/clearance": { endpoint: "clearance", handle: handleClearance },
};

const notFound = (rc: RequestContext, reason: string): Response => reject(rc, { status: 404, body: { error: "not found" }, reason });

function preflight(rc: RequestContext): Response {
  return new Response(null, { status: 204, headers: corsHeaders(rc.origin) });
}

function guard(rc: RequestContext): Response | null {
  const { env, request, origin } = rc;
  if (!isAllowedOrigin(origin, env)) {
    if (request.method === "OPTIONS") return new Response(null, { status: 403 });
    logRequest(rc, "rejected", `status=403 reason=origin_blocked origin=${origin.slice(0, MAX_LOGGED_ORIGIN_CHARS)}`);
    return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  if (request.method === "OPTIONS") return preflight(rc);
  if (request.method !== "POST") return notFound(rc, "method_not_allowed");

  const contentLength = Number(request.headers.get("Content-Length") || "");
  if (Number.isFinite(contentLength) && contentLength > settingsFor(env).maxBodyBytes) {
    return reject(rc, { status: 413, body: { error: "payload too large" }, reason: "payload_too_large" });
  }
  if (!env.SIGNING_SECRET_A || !env.SIGNING_SECRET_B || env.SIGNING_SECRET_A === env.SIGNING_SECRET_B) {
    logRequest(rc, "error", "status=500 reason=misconfigured");
    return jsonResponse(rc, { error: "worker misconfigured" }, 500);
  }
  return null;
}

export async function handleRequest(request: Request, env: Env, ctx: ExecutionContext, workerVersion: string): Promise<Response> {
  applyDebugLevel(env.LOG_DEBUG);
  const rc = createContext(request, env, ctx, workerVersion);
  const route = ROUTES[rc.path];
  if (route) rc.endpoint = route.endpoint;
  try {
    const rejected = guard(rc);
    if (rejected) return rejected;
    return route ? await route.handle(rc) : notFound(rc, "route_not_found");
  } catch (error) {
    if (error instanceof ConfigError) {
      logRequest(rc, "error", `status=500 reason=misconfigured variable=${error.variable}`);
      return jsonResponse(rc, { error: "worker misconfigured" }, 500);
    }
    const missingIp = error instanceof MissingClientIpError;
    const status = missingIp ? 400 : 500;
    if (missingIp) logRequest(rc, "rejected", "status=400 reason=missing_client_ip");
    else logRequest(rc, "error", `status=500 reason=unhandled error=${describeError(error)}`);
    return jsonResponse(rc, { error: missingIp ? "bad_request" : "internal_error" }, status);
  }
}
