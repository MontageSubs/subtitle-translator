import type { Env } from "../config/env";
import { settingsFor } from "../config/settings";
import { errorMessage, logSecurity } from "../telemetry/log";

const DEGRADED_RATE_LIMIT_DIVISOR = 4;
const PLAIN_VARIANT_RATE_LIMIT_DIVISOR = 3;
const MAX_RATE_LIMIT_CALLS_PER_REQUEST = 20;

async function passesLimiter(limiter: Env["BURST_LIMITER"], ipHash: string, label: string): Promise<boolean> {
  try {
    return (await limiter.limit({ key: ipHash })).success;
  } catch (error) {
    logSecurity(`${label}_LIMITER_UNAVAILABLE_FAILCLOSED`, ipHash, errorMessage(error));
    return false;
  }
}

export const consumeBurst = (env: Env, ipHash: string): Promise<boolean> => passesLimiter(env.BURST_LIMITER, ipHash, "BURST");

export const consumeHandshakeLimit = (env: Env, ipHash: string): Promise<boolean> => passesLimiter(env.HANDSHAKE_LIMITER, ipHash, "HANDSHAKE");

export interface RateLimitProfile {
  degraded: boolean;
  clearanceMultiplier: number;
  plainVariant: boolean;
}

function unitChars(env: Env, profile: RateLimitProfile): number {
  const base = settingsFor(env).rateLimitUnitChars;
  if (profile.degraded) return base / DEGRADED_RATE_LIMIT_DIVISOR;
  const scaled = profile.clearanceMultiplier > 1 ? base * profile.clearanceMultiplier : base;
  return profile.plainVariant ? scaled / PLAIN_VARIANT_RATE_LIMIT_DIVISOR : scaled;
}

export async function consumeRateLimit(env: Env, ipHash: string, chars: number, profile: RateLimitProfile): Promise<boolean> {
  const unit = Math.max(unitChars(env, profile), Math.ceil(chars / MAX_RATE_LIMIT_CALLS_PER_REQUEST) || 1);
  const hits = Math.max(1, Math.ceil(chars / unit));
  const results = await Promise.all(Array.from({ length: hits }, () => env.RATE_LIMITER.limit({ key: ipHash })));
  return results.every((result) => result.success);
}
