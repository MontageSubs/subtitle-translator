import { Env, riskyAsnSet } from "./env";
import { checkGate, escalateQuarantine, recordMalformedRequest } from "./reputation";
import { logGate } from "./response";

const DEFAULT_RATE_LIMIT_UNIT_CHARS = 500;
const DEGRADED_RATE_LIMIT_MULTIPLIER = 4;
const PLAIN_VARIANT_RATE_LIMIT_DIVISOR = 3;

function rateLimitUnitChars(env: Env, degraded: boolean, clearanceMultiplier: number, plainVariant: boolean): number {
  const base = Number(env.RATE_LIMIT_UNIT_CHARS) || DEFAULT_RATE_LIMIT_UNIT_CHARS;
  if (degraded) return base / DEGRADED_RATE_LIMIT_MULTIPLIER;
  const unit = clearanceMultiplier > 1 ? base * clearanceMultiplier : base;
  return plainVariant ? unit / PLAIN_VARIANT_RATE_LIMIT_DIVISOR : unit;
}

function isFromRiskyAsn(env: Env, request: Request): boolean {
  const asn = (request as Request & { cf?: { asn?: number } }).cf?.asn;
  return typeof asn === "number" && riskyAsnSet(env).has(asn);
}

export async function gateForRequest(env: Env, request: Request, ipHash: string, now: number) {
  try {
    const gate = await checkGate(env, env.DB, ipHash, now);
    if (isFromRiskyAsn(env, request)) {
      return { ...gate, requireClearance: gate.requireClearance || !gate.blocked };
    }
    return gate;
  } catch (e) {
    logGate("d1_read_failed_failclosed", ipHash, { message: e instanceof Error ? e.message : String(e) });
    return { blocked: true, quarantined: false, requireClearance: true, degraded: true, clearanceMultiplier: 1 };
  }
}

export async function consumeBurst(env: Env, ipHash: string): Promise<boolean> {
  try {
    const { success } = await env.BURST_LIMITER.limit({ key: ipHash });
    return success;
  } catch (e) {
    logGate("burst_limiter_unavailable_failclosed", ipHash, { message: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

export function escalateOnBurstTrip(ctx: ExecutionContext, env: Env, ipHash: string, now: number): void {
  ctx.waitUntil(escalateQuarantine(env, env.DB, ipHash, now).catch((e) => logGate("d1_write_failed", ipHash, { op: "escalateQuarantine", message: String(e) })));
}

export function flagMalformedRequest(ctx: ExecutionContext, env: Env, ipHash: string, now: number): void {
  ctx.waitUntil(
    recordMalformedRequest(env, env.DB, ipHash, now)
      .then((escalated) => { if (escalated) logGate("ip_escalated", ipHash, { reason: "malformed_request_threshold" }); })
      .catch((e) => logGate("d1_write_failed", ipHash, { op: "recordMalformedRequest", message: String(e) }))
  );
}

export async function consumeRateLimit(env: Env, ipHash: string, chars: number, degraded: boolean, clearanceMultiplier: number, plainVariant: boolean): Promise<boolean> {
  const unit = rateLimitUnitChars(env, degraded, clearanceMultiplier, plainVariant);
  const hits = Math.max(1, Math.ceil(chars / unit));
  const results = await Promise.all(Array.from({ length: hits }, () => env.RATE_LIMITER.limit({ key: ipHash })));
  return results.every((r) => r.success);
}
