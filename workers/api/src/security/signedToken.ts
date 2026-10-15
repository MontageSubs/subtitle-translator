import { decodeJson, encodeJson, hmacHex, timingSafeEqual } from "./crypto";
import { ringSecrets, type SecretRing } from "./secretRing";

export async function signToken(secret: string, domain: string, payload: unknown, ip: string, attachment?: string): Promise<string> {
  const body = attachment ? `${encodeJson(payload)}.${attachment}` : encodeJson(payload);
  return `${body}.${await hmacHex(secret, `${domain}${body}.${ip}`)}`;
}

export interface VerifiedPayload<T> {
  payload: T;
  secret: string;
  attachment?: string;
}

export async function openToken<T>(
  ring: SecretRing, token: string | null | undefined, domain: string, ip: string
): Promise<VerifiedPayload<T> | null> {
  const segments = (token || "").split(".");
  const signature = segments.pop();
  const [encoded, attachment] = segments;
  if (!encoded || !signature || segments.length > 2) return null;
  const signingInput = `${domain}${segments.join(".")}.${ip}`;
  for (const secret of ringSecrets(ring)) {
    if (!timingSafeEqual(await hmacHex(secret, signingInput), signature)) continue;
    const payload = decodeJson<T>(encoded);
    return payload ? { payload, secret, attachment } : null;
  }
  return null;
}
