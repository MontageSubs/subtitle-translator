import { base64url, base64urlDecode, hmacHex, timingSafeEqual } from "./crypto";
import { SecretRing, ringSecrets } from '../config/secret';

const VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const CLEARANCE_TTL_MS = 5 * 60_000;

export async function verifyTurnstileToken(secretKey: string, responseToken: string, remoteIp: string): Promise<boolean> {
  const body = new URLSearchParams({ secret: secretKey, response: responseToken, remoteip: remoteIp });
  const res = await fetch(VERIFY_ENDPOINT, { method: "POST", body });
  const data = await res.json<{ success: boolean }>().catch(() => ({ success: false }));
  return Boolean(data.success);
}

export async function issueClearance(ring: SecretRing): Promise<string> {
  const encoded = base64url(JSON.stringify({ exp: Date.now() + CLEARANCE_TTL_MS }));
  return `${encoded}.${await hmacHex(ring.current, encoded)}`;
}

export async function verifyClearance(ring: SecretRing, clearance: string | null | undefined): Promise<boolean> {
  if (!clearance) return false;
  const [encoded, signature] = clearance.split(".");
  if (!encoded || !signature) return false;
  for (const secret of ringSecrets(ring)) {
    if (!timingSafeEqual(await hmacHex(secret, encoded), signature)) continue;
    try {
      const { exp } = JSON.parse(base64urlDecode(encoded));
      return Date.now() < exp;
    } catch {
      return false;
    }
  }
  return false;
}
