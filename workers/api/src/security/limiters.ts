import type { Env } from "../config/env";
import { settingsFor } from "../config/settings";
import { reportFault } from "../logging/fault";

const MAX_RATE_LIMIT_CALLS_PER_REQUEST = 20;

async function passesLimiter(limiter: Env["LIMITER_BURST"], ipHash: string, label: string): Promise<boolean> {
  try {
    return (await limiter.limit({ key: ipHash })).success;
  } catch (error) {
    reportFault(`${label}_limiter_unavailable`, error, ipHash);
    return false;
  }
}

export const consumeBurst = (env: Env, ipHash: string): Promise<boolean> => passesLimiter(env.LIMITER_BURST, ipHash, "burst");

export const consumeSessionLimit = (env: Env, ipHash: string): Promise<boolean> => passesLimiter(env.LIMITER_SESSION, ipHash, "session");

export interface RateLimitProfile {
  degraded: boolean;
  clearanceMultiplier: number;
  plainVariant: boolean;
}

function unitChars(env: Env, profile: RateLimitProfile): number {
  const { rateLimitUnitChars: base, rateDegradedDivisor, ratePlainDivisor } = settingsFor(env);
  if (profile.degraded) return base / rateDegradedDivisor;
  const scaled = profile.clearanceMultiplier > 1 ? base * profile.clearanceMultiplier : base;
  return profile.plainVariant ? scaled / ratePlainDivisor : scaled;
}

export async function consumeRateLimit(env: Env, ipHash: string, chars: number, profile: RateLimitProfile): Promise<boolean> {
  const unit = Math.max(unitChars(env, profile), Math.ceil(chars / MAX_RATE_LIMIT_CALLS_PER_REQUEST) || 1);
  const hits = Math.max(1, Math.ceil(chars / unit));
  const results = await Promise.all(Array.from({ length: hits }, () => env.LIMITER_RATE.limit({ key: ipHash })));
  return results.every((result) => result.success);
}
