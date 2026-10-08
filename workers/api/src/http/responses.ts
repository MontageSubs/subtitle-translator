import { logHttp } from "../telemetry/log";
import { leaksSecret } from "./outputGuard";
import { elapsedMs, type RequestContext } from "./context";

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

export function jsonResponse(rc: RequestContext, body: unknown, status: number): Response {
  const serialized = JSON.stringify(body);
  const blocked = leaksSecret(serialized, rc.env);
  if (blocked) console.error(JSON.stringify({ event: "output_blocked", ts: Date.now() }));
  return new Response(blocked ? JSON.stringify({ error: "output_blocked" }) : serialized, {
    status: blocked ? 500 : status,
    headers: { "Content-Type": "application/json", ...corsHeaders(rc.origin) },
  });
}

export interface Rejection {
  status: number;
  body: unknown;
  detail: string;
  ipHash?: string;
}

export function reject(rc: RequestContext, { status, body, detail, ipHash }: Rejection): Response {
  logHttp("POST", rc.path, status, elapsedMs(rc), ipHash, detail);
  return jsonResponse(rc, body, status);
}

export const verificationRequired = (rc: RequestContext, detail: string, ipHash?: string): Response =>
  reject(rc, { status: 429, body: { error: "verification_required", trigger_turnstile: true }, detail, ipHash });

export const verificationFailed = (rc: RequestContext, detail: string, ipHash?: string): Response =>
  reject(rc, { status: 403, body: { error: "verification_failed" }, detail, ipHash });

export const invalidRequest = (rc: RequestContext, detail: string, ipHash?: string): Response =>
  reject(rc, { status: 400, body: { error: "invalid_request" }, detail, ipHash });
