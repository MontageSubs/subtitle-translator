import { decodeJson, encodeJson, hmacHex, timingSafeEqual } from "./crypto";
import { ringSecrets, type SecretRing } from "./secretRing";

export async function signToken(secret: string, domain: string, payload: unknown, ip: string): Promise<string> {
  const encoded = encodeJson(payload);
  return `${encoded}.${await hmacHex(secret, `${domain}${encoded}.${ip}`)}`;
}

export interface VerifiedPayload<T> {
  payload: T;
  secret: string;
}

export async function openToken<T>(
  ring: SecretRing, token: string | null | undefined, domain: string, ip: string
): Promise<VerifiedPayload<T> | null> {
  const [encoded, signature] = (token || "").split(".");
  if (!encoded || !signature) return null;
  const signingInput = `${domain}${encoded}.${ip}`;
  for (const secret of ringSecrets(ring)) {
    if (!timingSafeEqual(await hmacHex(secret, signingInput), signature)) continue;
    const payload = decodeJson<T>(encoded);
    return payload ? { payload, secret } : null;
  }
  return null;
}
