import { hmacHex } from "./crypto";

export interface SecretRing {
  current: string;
  previous?: string;
}

export interface RingSource {
  WORKER_SECRET_A?: string;
  WORKER_SECRET_B?: string;
  WORKER_SALT?: string;
}

const ROTATION_PERIOD_MS = 604_800_000;

let cached: { key: string; ring: Promise<SecretRing> } | undefined;

const derive = (secret: string, salt: string): Promise<string> | string => (salt ? hmacHex(secret, salt) : secret);

async function buildRing(fresh: string, stale: string, salt: string): Promise<SecretRing> {
  const [current, previous] = await Promise.all([derive(fresh, salt), stale ? derive(stale, salt) : undefined]);
  return { current, previous };
}

export function resolveSecretRing(source: RingSource, now: number = Date.now()): Promise<SecretRing> {
  const a = source.WORKER_SECRET_A || "";
  const b = source.WORKER_SECRET_B || "";
  const salt = source.WORKER_SALT || "";
  const aIsFresh = Math.floor(now / ROTATION_PERIOD_MS) % 2 === 0;
  const key = `${aIsFresh ? "A" : "B"}\u0000${a}\u0000${b}\u0000${salt}`;
  if (cached?.key !== key) {
    cached = { key, ring: buildRing(aIsFresh ? a : b, aIsFresh ? b : a, salt) };
    cached.ring.catch(() => (cached = undefined));
  }
  return cached.ring;
}

export const ringSecrets = (ring: SecretRing): string[] => (ring.previous ? [ring.current, ring.previous] : [ring.current]);
