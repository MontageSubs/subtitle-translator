import type { Env } from "../config/env";

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
      env.WORKER_SALT, env.IP_HASH_SALT, env.TURSO_AUTH_TOKEN, env.TURSO_URL, env.TURNSTILE_SECRET_KEY,
      env.GOOGLE_TRANSLATE_API_KEY, env.GOOGLE_TRANSLATE_V2_API_KEY, env.DEEPL_API_KEY, env.WORKER_SECRET_A, env.WORKER_SECRET_B,
    ].filter(isAuditable);
    envSecrets.set(env, secrets);
  }
  return secrets;
}

export function leaksSecret(serialized: string, env: Env): boolean {
  for (const secret of configuredSecrets(env)) if (serialized.includes(secret)) return true;
  for (const secret of runtimeSecrets) if (serialized.includes(secret)) return true;
  return false;
}
