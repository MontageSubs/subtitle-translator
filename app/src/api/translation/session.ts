import { IDLE_STANDBY_MARGIN_MS } from "../../config/config";
import { FALLBACK_CAPABILITIES, parseCapabilities } from "./capabilities";
import { withRetry } from "./retry";
import { currentClearance } from "./tokens";
import { postJson } from "./transport";
import { assertWorkerCompatible } from "./workerCompat";
import type { WorkerCapabilities, WorkerSessionPayload } from "./types";

const STANDBY_TTL_MS = 15_000;
const ACTIVE_TTL_MS = 20_000;

interface Session extends WorkerSessionPayload {
  issuedAt: number;
  ttl: number;
}

let session: Session | null = null;
let capabilities: WorkerCapabilities | null = null;

function isFresh(candidate: Session | null): candidate is Session {
  return candidate !== null && Date.now() - candidate.issuedAt < candidate.ttl - IDLE_STANDBY_MARGIN_MS;
}

export function adoptSession(payload: WorkerSessionPayload, ttl = ACTIVE_TTL_MS): void {
  const { token, challengeKey, nonce, recipe } = payload;
  session = { token, challengeKey, nonce, recipe, issuedAt: Date.now(), ttl };
}

export function handshake(signal?: AbortSignal): Promise<void> {
  return withRetry(async () => {
    const clearance = currentClearance();
    const payload = await postJson("/handshake", clearance ? { clearance } : {}, signal);
    assertWorkerCompatible(payload.worker_version);
    capabilities = parseCapabilities(payload.capabilities) ?? capabilities;
    adoptSession(payload, STANDBY_TTL_MS);
  }, signal);
}

export async function resolveCapabilities(signal?: AbortSignal): Promise<WorkerCapabilities> {
  if (!capabilities && !isFresh(session)) await handshake(signal);
  return capabilities ?? FALLBACK_CAPABILITIES;
}

export async function takeSession(signal?: AbortSignal): Promise<Session> {
  if (!isFresh(session)) await handshake(signal);
  const active = session!;
  session = null;
  return active;
}
