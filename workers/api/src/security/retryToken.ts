import { base64url, base64urlDecode, hmacHex, timingSafeEqual } from "./crypto";
import { SecretRing, ringSecrets } from '../config/secret';

export const RETRY_TOKEN_TTL_MS = 120 * 1000;

const SIGNING_DOMAIN_PREFIX = "retry:";
const BLOOM_BITS = 65536;
const BLOOM_BYTES = 8192;
const BASE64_CHUNK = 0x8000;

export interface RetryTokenPayload {
  correlation_id: string;
  exp: number;
  bloom_filter: string;
}

export interface IssueRetryTokenParams {
  correlationId: string;
  bloomFilter: string;
}

export interface HashableCue {
  id: number;
  text: string;
}

function fnv1aPair(str: string): [number, number] {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  return [h1 >>> 0, h2 >>> 0];
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

export function buildCueBloomFilter(cues: HashableCue[]): string {
  const bytes = new Uint8Array(BLOOM_BYTES);
  const mask = BLOOM_BITS - 1;
  for (const c of cues) {
    const [h1, h2] = fnv1aPair(c.text);
    const bit1 = h1 & mask;
    const bit2 = (h1 + h2) & mask;
    const bit3 = (h1 + 2 * h2) & mask;
    bytes[bit1 >> 3] |= 1 << (bit1 & 7);
    bytes[bit2 >> 3] |= 1 << (bit2 & 7);
    bytes[bit3 >> 3] |= 1 << (bit3 & 7);
  }
  return base64url(bytesToBinaryString(bytes));
}

export function verifyCuesInBloomFilter(cues: HashableCue[], filterBase64: string): boolean {
  if (!filterBase64 || !Array.isArray(cues) || cues.length === 0) return false;
  let binary: string;
  try {
    binary = base64urlDecode(filterBase64);
  } catch {
    return false;
  }
  if (binary.length !== BLOOM_BYTES) return false;
  const bytes = new Uint8Array(BLOOM_BYTES);
  for (let i = 0; i < BLOOM_BYTES; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const mask = BLOOM_BITS - 1;
  for (const c of cues) {
    const [h1, h2] = fnv1aPair(c.text);
    const bit1 = h1 & mask;
    const bit2 = (h1 + h2) & mask;
    const bit3 = (h1 + 2 * h2) & mask;
    if (
      !(bytes[bit1 >> 3] & (1 << (bit1 & 7))) ||
      !(bytes[bit2 >> 3] & (1 << (bit2 & 7))) ||
      !(bytes[bit3 >> 3] & (1 << (bit3 & 7)))
    ) {
      return false;
    }
  }
  return true;
}

export async function issueRetryToken(ring: SecretRing, params: IssueRetryTokenParams, ip: string): Promise<string> {
  const payload: RetryTokenPayload = {
    correlation_id: params.correlationId,
    exp: Date.now() + RETRY_TOKEN_TTL_MS,
    bloom_filter: params.bloomFilter,
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
