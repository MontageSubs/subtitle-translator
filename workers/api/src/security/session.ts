import { base64url, base64urlDecode, bytesToBinary, sha256Uint32 } from "./crypto";
import { generateRecipe, isValidRecipe, type Recipe } from "./clientCheck";
import { openToken, signatureOf, signToken } from "./signedToken";
import type { SecretRing } from "./secretRing";
import { cacheEntry } from "../support/cacheEntry";

const CHALLENGE_VERSION = 3;
const CHALLENGE_KEY_BYTES = 16;
const CLOCK_SKEW_MS = 5000;
const SESSION_DOMAIN = "";

export interface SessionPayload {
  ts: number;
  ttl: number;
  nonce: number;
  cv: number;
  ck: string;
  recipe: Recipe;
}

export interface IssuedSession {
  token: string;
  challengeKey: string;
}

export interface VerifiedSession {
  payload: SessionPayload;
  signature: string;
}

const nonceKey = (signature: string): string => `https://nonce.internal/${signature}`;

export async function issueSession(ring: SecretRing, ttl: number, ip: string): Promise<IssuedSession> {
  const challengeKey = base64url(bytesToBinary(crypto.getRandomValues(new Uint8Array(CHALLENGE_KEY_BYTES))));
  const payload: SessionPayload = { ts: Date.now(), ttl, nonce: crypto.getRandomValues(new Uint32Array(1))[0]!, cv: CHALLENGE_VERSION, ck: challengeKey, recipe: generateRecipe() };
  const token = await signToken(ring.current, SESSION_DOMAIN, payload, ip);
  await caches.default.put(nonceKey(signatureOf(token)), cacheEntry("1", Math.ceil(ttl / 1000)));
  return { token, challengeKey };
}

export async function verifySession(ring: SecretRing, token: string | undefined, ip: string): Promise<VerifiedSession | null> {
  const verified = await openToken<SessionPayload>(ring, token, SESSION_DOMAIN, ip);
  if (!verified) return null;
  const { payload } = verified;
  const age = Date.now() - payload.ts;
  if (!Number.isFinite(age) || age < -CLOCK_SKEW_MS || age > payload.ttl) return null;
  if (payload.cv !== CHALLENGE_VERSION || typeof payload.ck !== "string" || !isValidRecipe(payload.recipe)) return null;
  return verified;
}

export async function consumeNonce(signature: string): Promise<boolean> {
  try {
    return await caches.default.delete(nonceKey(signature));
  } catch {
    return false;
  }
}

export function computeAnswer(challengeKey: string, proofCommitment: number): Promise<number> {
  const key = base64urlDecode(challengeKey);
  const commitment = String(proofCommitment);
  const message = new Uint8Array(key.length + commitment.length);
  for (let i = 0; i < key.length; i++) message[i] = key.charCodeAt(i);
  for (let i = 0; i < commitment.length; i++) message[key.length + i] = commitment.charCodeAt(i);
  return sha256Uint32(message);
}
