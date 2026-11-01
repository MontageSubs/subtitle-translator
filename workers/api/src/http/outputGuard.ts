import type { Env } from "../config/env";
import { settingsFor } from "../config/settings";

const MIN_AUDITED_SECRET_LENGTH = 8;
const runtimeSecrets = new Set<string>();
const envSecrets = new WeakMap<Env, string[]>();

const isAuditable = (value: unknown): value is string => typeof value === "string" && value.trim().length >= MIN_AUDITED_SECRET_LENGTH;

export function registerRuntimeSecret(value: string): void {
  if (isAuditable(value)) runtimeSecrets.add(value);
}

function configuredSecrets(env: Env): string[] {
  let secrets = envSecrets.get(env);
  if (!secrets) {
    secrets = [
      env.SALT_KEYRING, env.SALT_IPHASH, env.TURSO_TOKEN, env.TURSO_URL, env.TURNSTILE_SECRET,
      env.KEY_GOOGLE, env.KEY_GOOGLE_V2, env.KEY_DEEPL, env.SECRET_A, env.SECRET_B,
    ].filter(isAuditable);
    envSecrets.set(env, secrets);
  }
  return secrets;
}

export function leaksSecret(serialized: string, env: Env): boolean {
  if (!settingsFor(env).outputGuard) return false;
  for (const secret of configuredSecrets(env)) if (serialized.includes(secret)) return true;
  for (const secret of runtimeSecrets) if (serialized.includes(secret)) return true;
  return false;
}
