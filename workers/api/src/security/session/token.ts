import { bytesToBinary, base64url } from "../crypto";
import { generateRecipe, isValidRecipe, type Recipe } from "../clientCheck/recipe";
import { openToken, signToken } from "../signedToken";
import type { SecretRing } from "../secretRing";
import { deriveChallengeKey } from "./challenge";
import { storeNonce } from "./nonce";

const CHALLENGE_VERSION = 2;
const CLOCK_SKEW_MS = 5000;
const SESSION_DOMAIN = "";

export interface SessionPayload {
  ts: number;
  ttl: number;
  nonce: number;
  cv: number;
  recipe: Recipe;
}

export interface IssuedSession {
  token: string;
  challengeKey: string;
}

export interface VerifiedSession {
  payload: SessionPayload;
  secret: string;
}

export async function issueSession(ring: SecretRing, ttl: number, ip: string, ipHash: string): Promise<IssuedSession> {
  const nonce = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const payload: SessionPayload = { ts: Date.now(), ttl, nonce, cv: CHALLENGE_VERSION, recipe: generateRecipe() };
  const [token, key] = await Promise.all([signToken(ring.current, SESSION_DOMAIN, payload, ip), deriveChallengeKey(ring.current, nonce)]);
  await storeNonce(caches.default, nonce, ipHash, ring.current, Math.ceil(ttl / 1000));
  return { token, challengeKey: base64url(bytesToBinary(key)) };
}

export async function verifySession(ring: SecretRing, token: string | undefined, ip: string): Promise<VerifiedSession | null> {
  const verified = await openToken<SessionPayload>(ring, token, SESSION_DOMAIN, ip);
  if (!verified) return null;
  const { payload } = verified;
  const age = Date.now() - payload.ts;
  if (!Number.isFinite(age) || age < -CLOCK_SKEW_MS || age > payload.ttl) return null;
  if (payload.cv !== CHALLENGE_VERSION || !isValidRecipe(payload.recipe)) return null;
  return verified;
}
