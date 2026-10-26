import { openToken, signToken } from "../signedToken";
import type { SecretRing } from "../secretRing";

export const RETRY_TOKEN_TTL_MS = 3_600_000;
export const MAX_RETRY_BATCH_CUES = 1000;
const MAX_RETRY_CHAIN_REQUESTS = 20;

const RETRY_DOMAIN = "retry:";

export interface RetryGrant {
  cleared: boolean;
  clearanceMultiplier: number;
  plainVariant: boolean;
}

export interface VerifiedRetryToken {
  payload: RetryTokenPayload;
  secret: string;
  bloomFilter: string;
}

export interface RetryScope {
  bloomFilter: string;
  remaining: number;
}

export interface RetryTokenPayload {
  correlation_id: string;
  exp: number;
  remaining: number;
  grant: RetryGrant;
}

export const startRetryScope = (bloomFilter: string): RetryScope => ({ bloomFilter, remaining: MAX_RETRY_CHAIN_REQUESTS });

export const advanceRetryScope = ({ bloomFilter, remaining }: RetryScope): RetryScope | null => (remaining > 1 ? { bloomFilter, remaining: remaining - 1 } : null);

export const issueRetryToken = (ring: SecretRing, scope: RetryScope, { cleared, clearanceMultiplier, plainVariant }: RetryGrant, ip: string): Promise<string> =>
  signToken(
    ring.current,
    RETRY_DOMAIN,
    { correlation_id: crypto.randomUUID(), exp: Date.now() + RETRY_TOKEN_TTL_MS, remaining: scope.remaining, grant: { cleared, clearanceMultiplier, plainVariant } } satisfies RetryTokenPayload,
    ip,
    scope.bloomFilter
  );

export async function verifyRetryToken(ring: SecretRing, token: string, ip: string): Promise<VerifiedRetryToken | null> {
  const verified = await openToken<RetryTokenPayload>(ring, token, RETRY_DOMAIN, ip);
  if (!verified?.attachment) return null;
  const { payload, secret, attachment } = verified;
  const { exp, remaining, grant } = payload;
  return Number.isFinite(exp) && Date.now() <= exp && Number.isInteger(remaining) && remaining > 0 && grant ? { payload, secret, bloomFilter: attachment } : null;
}
