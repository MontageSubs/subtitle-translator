import { base64url, base64urlDecode, hmacHex, timingSafeEqual } from "./crypto";
import { SecretRing, ringSecrets } from '../config/secret';

export const RETRY_TOKEN_TTL_MS = 60 * 60 * 1000;
export const RETRY_TOKEN_GUARD_TTL_MS = 24 * 60 * 60 * 1000;

const SIGNING_DOMAIN_PREFIX = "retry:";

export interface RetryTokenPayload {
  correlation_id: string;
  exp: number;
  content_hash: string;
  outstanding_ids: number[];
}

export interface IssueRetryTokenParams {
  correlationId: string;
  contentHash: string;
  outstandingIds: number[];
}

export interface HashableCue {
  id: number;
  text: string;
}

export function canonicalCueContent(cues: HashableCue[]): string {
  return [...cues].sort((a, b) => a.id - b.id).map((c) => `${c.id}\u0000${c.text}`).join("\u0001");
}

export async function issueRetryToken(ring: SecretRing, params: IssueRetryTokenParams, ip: string): Promise<string> {
  const payload: RetryTokenPayload = {
    correlation_id: params.correlationId,
    exp: Date.now() + RETRY_TOKEN_TTL_MS,
    content_hash: params.contentHash,
    outstanding_ids: params.outstandingIds,
  };
  const encoded = base64url(JSON.stringify(payload));
  const signingInput = `${SIGNING_DOMAIN_PREFIX}${encoded}.${ip}`;
  const signature = await hmacHex(ring.current, signingInput);
  return `${encoded}.${signature}`;
}

export async function verifyRetryToken(ring: SecretRing, token: string, ip: string): Promise<{ payload: RetryTokenPayload; secret: string } | null> {
  const [encoded, signature] = (token || "").split(".");
  if (!encoded || !signature) return null;
  for (const secret of ringSecrets(ring)) {
    const signingInput = `${SIGNING_DOMAIN_PREFIX}${encoded}.${ip}`;
    const expected = await hmacHex(secret, signingInput);
    if (!timingSafeEqual(expected, signature)) continue;
    let payload: RetryTokenPayload;
    try {
      payload = JSON.parse(base64urlDecode(encoded));
    } catch {
      return null;
    }
    if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) return null;
    return { payload, secret };
  }
  return null;
}
