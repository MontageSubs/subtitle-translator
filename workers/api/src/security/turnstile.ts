import { egressFetch } from "../upstream/egress";
import { signToken, openToken } from "./signedToken";
import type { SecretRing } from "./secretRing";

const VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const CLEARANCE_DOMAIN = "";
const CLEARANCE_TTL_MS = 5 * 60_000;

export async function verifyTurnstileToken(secretKey: string, responseToken: string, remoteIp: string): Promise<boolean> {
  const response = await egressFetch(VERIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: secretKey, response: responseToken, remoteip: remoteIp }),
  });
  const data = await response.json<{ success?: boolean }>().catch(() => ({ success: false }));
  return Boolean(data.success);
}

export const issueClearance = (ring: SecretRing, ip: string): Promise<string> =>
  signToken(ring.current, CLEARANCE_DOMAIN, { exp: Date.now() + CLEARANCE_TTL_MS }, ip);

export async function verifyClearance(ring: SecretRing, clearance: string | null | undefined, ip: string): Promise<boolean> {
  const verified = await openToken<{ exp: number }>(ring, clearance, CLEARANCE_DOMAIN, ip);
  return Boolean(verified) && Date.now() < verified!.payload.exp;
}
