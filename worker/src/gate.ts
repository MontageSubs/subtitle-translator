import { Env, riskyAsnSet } from "./env";
import { checkGate, escalateQuarantine } from "./reputation";
import { logGate } from "./response";

const DEFAULT_RATE_LIMIT_UNIT_CHARS = 500;
const DEGRADED_RATE_LIMIT_MULTIPLIER = 4;
const CLEARED_RATE_LIMIT_MULTIPLIER = 20;

function rateLimitUnitChars(env: Env, degraded: boolean, cleared: boolean): number {
  const base = Number(env.RATE_LIMIT_UNIT_CHARS) || DEFAULT_RATE_LIMIT_UNIT_CHARS;
  if (degraded) return base / DEGRADED_RATE_LIMIT_MULTIPLIER;
  if (cleared) return base * CLEARED_RATE_LIMIT_MULTIPLIER;
  return base;
}

function isFromRiskyAsn(env: Env, request: Request): boolean {
  const asn = (request as Request & { cf?: { asn?: number } }).cf?.asn;
  return typeof asn === "number" && riskyAsnSet(env).has(asn);
}

export async function gateForRequest(env: Env, request: Request, ipHash: string, now: number) {
  try {
    const gate = await checkGate(env.DB, ipHash, now);
    if (isFromRiskyAsn(env, request)) {
      return { ...gate, requireClearance: gate.requireClearance || !gate.blocked };
    }
    return gate;
  } catch (e) {
    logGate("d1_read_failed_failopen", ipHash, { message: e instanceof Error ? e.message : String(e) });
    return { blocked: false, quarantined: false, requireClearance: isFromRiskyAsn(env, request), degraded: true };
  }
}

export async function consumeBurst(env: Env, ipHash: string): Promise<boolean> {
  const { success } = await env.BURST_LIMITER.limit({ key: ipHash });
  return success;
}

export function escalateOnBurstTrip(ctx: ExecutionContext, env: Env, ipHash: string, now: number): void {
  ctx.waitUntil(escalateQuarantine(env.DB, ipHash, now).catch((e) => logGate("d1_write_failed", ipHash, { op: "escalateQuarantine", message: String(e) })));
}

export async function consumeRateLimit(env: Env, ipHash: string, chars: number, degraded: boolean, cleared: boolean): Promise<boolean> {
  const unit = rateLimitUnitChars(env, degraded, cleared);
  const hits = Math.max(1, Math.ceil(chars / unit));
  const results = await Promise.all(Array.from({ length: hits }, () => env.RATE_LIMITER.limit({ key: ipHash })));
  return results.every((r) => r.success);
}
