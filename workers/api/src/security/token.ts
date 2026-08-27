import { base64url, base64urlDecode, hmacHex, timingSafeEqual } from "./crypto";
import { deriveChallengeKey } from "./challenge";
import { SecretRing, ringSecrets } from '../config/secret';
import { Recipe, isValidRecipe } from '../config/envProbe';

export const CHALLENGE_VERSION = 1;

interface TokenPayload {
  ts: number;
  ttl: number;
  nonce: number;
  cv: number;
  recipe: Recipe;
}

export interface IssuedSession {
  token: string;
  challengeKey: string;
  nonce: number;
}

export interface VerifiedToken {
  payload: TokenPayload;
  secret: string;
}

function toBase64(bytes: Uint8Array): string {
  return base64url(String.fromCharCode(...bytes));
}

export async function issueSession(ring: SecretRing, ttl: number, recipe: Recipe): Promise<IssuedSession> {
  const nonce = crypto.getRandomValues(new Uint32Array(1))[0];
  const payload: TokenPayload = { ts: Date.now(), ttl, nonce, cv: CHALLENGE_VERSION, recipe };
  const encoded = base64url(JSON.stringify(payload));
  const signature = await hmacHex(ring.current, encoded);
  const challengeKey = toBase64(await deriveChallengeKey(ring.current, nonce));
  return { token: `${encoded}.${signature}`, challengeKey, nonce };
}

export async function verifyToken(ring: SecretRing, token: string): Promise<VerifiedToken | null> {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  for (const secret of ringSecrets(ring)) {
    const expected = await hmacHex(secret, encoded);
    if (!timingSafeEqual(expected, signature)) continue;
    let payload: TokenPayload;
    try {
      payload = JSON.parse(base64urlDecode(encoded));
    } catch {
      return null;
    }
    const age = Date.now() - payload.ts;
    if (!Number.isFinite(age) || age < -5000 || age > payload.ttl) return null;
    if (payload.cv !== CHALLENGE_VERSION) return null;
    if (!isValidRecipe(payload.recipe)) return null;
    return { payload, secret };
  }
  return null;
}
