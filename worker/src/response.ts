import { Env } from "./env";

const PREFLIGHT_MAX_AGE = "7200";
const MIN_AUDITED_SECRET_LENGTH = 8;

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
    Vary: "Origin",
  };
}

function auditedSecrets(env: Env): string[] {
  return [
    env.WORKER_SALT, env.TURSO_AUTH_TOKEN, env.TURNSTILE_SECRET_KEY, env.GOOGLE_TRANSLATE_API_KEY,
    env.TURSO_URL, env.WORKER_SECRET_A, env.WORKER_SECRET_B,
  ].filter((value): value is string => typeof value === "string" && value.trim().length >= MIN_AUDITED_SECRET_LENGTH);
}

export function containsAuditedSecret(serialized: string, env: Env): boolean {
  return auditedSecrets(env).some((secret) => serialized.includes(secret));
}

export function json(body: unknown, status: number, origin: string, env: Env): Response {
  const serialized = JSON.stringify(body);
  if (containsAuditedSecret(serialized, env)) {
    console.error(JSON.stringify({ event: "output_blocked", ts: Date.now() }));
    return new Response(JSON.stringify({ error: "output_blocked" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  }
  return new Response(serialized, { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}

export function ndjsonStream(
  ctx: ExecutionContext, origin: string, env: Env, produce: (emit: (event: object) => Promise<void>) => Promise<void>
): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emit = async (event: object) => {
    const serialized = JSON.stringify(event);
    const safe = containsAuditedSecret(serialized, env)
      ? JSON.stringify({ type: "error", message: "output_blocked", fatal: true })
      : serialized;
    await writer.write(encoder.encode(safe + "\n"));
  };

  ctx.waitUntil((async () => {
    try {
      await produce(emit);
    } catch (e) {
      await emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      await writer.close();
    }
  })());

  return new Response(readable, { status: 200, headers: { "Content-Type": "application/x-ndjson", ...corsHeaders(origin) } });
}

export async function parseBody<T>(request: Request, maxBytes: number): Promise<T | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const raw = new TextDecoder().decode(chunks.length === 1 ? chunks[0] : concatChunks(chunks, received));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export function logGate(event: string, ip: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ip, ts: Date.now(), ...extra }));
}

export function reportError(label: string, e: unknown): void {
  console.error(`${label}: ${e instanceof Error ? e.message : String(e)}`);
}
