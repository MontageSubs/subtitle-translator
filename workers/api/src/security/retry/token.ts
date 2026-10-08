import { openToken, signToken, type VerifiedPayload } from "../signedToken";
import type { SecretRing } from "../secretRing";

export const RETRY_TOKEN_TTL_MS = 120 * 1000;
export const MAX_RETRY_BATCH_CUES = 1000;

const RETRY_DOMAIN = "retry:";

export interface RetryTokenPayload {
  correlation_id: string;
  exp: number;
  bloom_filter: string;
}

export const issueRetryToken = (ring: SecretRing, correlationId: string, bloomFilter: string, ip: string): Promise<string> =>
  signToken(ring.current, RETRY_DOMAIN, { correlation_id: correlationId, exp: Date.now() + RETRY_TOKEN_TTL_MS, bloom_filter: bloomFilter } satisfies RetryTokenPayload, ip);

export async function verifyRetryToken(ring: SecretRing, token: string, ip: string): Promise<VerifiedPayload<RetryTokenPayload> | null> {
  const verified = await openToken<RetryTokenPayload>(ring, token, RETRY_DOMAIN, ip);
  return verified && Number.isFinite(verified.payload.exp) && Date.now() <= verified.payload.exp ? verified : null;
}
