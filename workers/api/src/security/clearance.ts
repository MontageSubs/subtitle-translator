import { signToken, openToken } from "./signedToken";
import type { SecretRing } from "./secretRing";

const CLEARANCE_DOMAIN = "";

export const issueClearance = (ring: SecretRing, ip: string, ttlMs: number): Promise<string> =>
  signToken(ring.current, CLEARANCE_DOMAIN, { exp: Date.now() + ttlMs }, ip);

export async function verifyClearance(ring: SecretRing, clearance: string | null | undefined, ip: string): Promise<boolean> {
  const verified = await openToken<{ exp: number }>(ring, clearance, CLEARANCE_DOMAIN, ip);
  return Boolean(verified) && Date.now() < verified!.payload.exp;
}
