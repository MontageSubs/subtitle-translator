import { hmacHex } from "./crypto";

export interface SecretRing {
  current: string;
  previous?: string;
}

function dayOfYearUTC(now: number): number {
  const date = new Date(now);
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - startOfYear) / 86_400_000);
}

export function freshSlot(now: number): "A" | "B" {
  return dayOfYearUTC(now) % 2 === 0 ? "A" : "B";
}

async function deriveKey(secret: string, salt: string): Promise<string> {
  return salt ? hmacHex(secret, salt) : secret;
}

export async function resolveSecretRing(secretA: string, secretB: string, salt: string): Promise<SecretRing> {
  const [freshRaw, staleRaw] = freshSlot(Date.now()) === "A" ? [secretA, secretB] : [secretB, secretA];
  const current = await deriveKey(freshRaw, salt);
  const previous = staleRaw ? await deriveKey(staleRaw, salt) : undefined;
  return { current, previous };
}

export function ringSecrets(ring: SecretRing): string[] {
  return ring.previous ? [ring.current, ring.previous] : [ring.current];
}

