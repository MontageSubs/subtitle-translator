import { settingsFor } from "../config/settings";
import { reportFault } from "../logging/fault";
import { logRequest } from "../logging/requestLog";
import { leaksSecret } from "./outputGuard";
import type { RequestContext } from "./context";
import type { QuotaHint } from "../security/quota/policy";

const PREFLIGHT_MAX_AGE = "7200";

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
    Vary: "Origin",
  };
}

function withEndpoints(rc: RequestContext, body: unknown): unknown {
  const { serviceUrl, fallbackUrl } = settingsFor(rc.env);
  if (!body || typeof body !== "object" || Array.isArray(body) || (!serviceUrl && !fallbackUrl)) return body;
  return { ...body, ...(serviceUrl && { service_url: serviceUrl }), ...(fallbackUrl && { fallback_url: fallbackUrl }) };
}

export function jsonResponse(rc: RequestContext, body: unknown, status: number): Response {
  const serialized = JSON.stringify(withEndpoints(rc, body));
  const blocked = leaksSecret(serialized, rc.env);
  if (blocked) reportFault("output_blocked", "secret detected in response");
  return new Response(blocked ? JSON.stringify({ error: "output_blocked" }) : serialized, {
    status: blocked ? 500 : status,
    headers: { "Content-Type": "application/json", ...corsHeaders(rc.origin) },
  });
}

export interface Rejection {
  status: number;
  body: unknown;
  reason: string;
  ipHash?: string;
}

export function reject(rc: RequestContext, { status, body, reason, ipHash }: Rejection): Response {
  logRequest(rc, status >= 500 ? "error" : "rejected", `status=${status} reason=${reason}`, ipHash);
  return jsonResponse(rc, body, status);
}

export const clientOutdated = (rc: RequestContext, minClientVersion: string, ipHash?: string): Response =>
  reject(rc, { status: 426, body: { error: "client_outdated", min_client_version: minClientVersion, worker_version: rc.workerVersion }, reason: "client_outdated", ipHash });

export const verificationRequired = (rc: RequestContext, reason: string, ipHash?: string, quota?: QuotaHint): Response =>
  reject(rc, { status: 429, body: { error: "verification_required", trigger_turnstile: true, ...(quota && { quota }) }, reason, ipHash });

export const accessBlocked = (rc: RequestContext, retryAt: number, reason: string, ipHash?: string): Response =>
  reject(rc, { status: 403, body: { error: "access_blocked", retry_at: retryAt }, reason, ipHash });

export const verificationFailed = (rc: RequestContext, reason: string, ipHash?: string): Response =>
  reject(rc, { status: 403, body: { error: "verification_failed" }, reason, ipHash });

export const invalidRequest = (rc: RequestContext, reason: string, ipHash?: string): Response =>
  reject(rc, { status: 400, body: { error: "invalid_request" }, reason, ipHash });
