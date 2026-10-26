import { IDLE_STANDBY_MARGIN_MS } from "../../config/config";
import { STORAGE_KEYS } from "../../config/storage";
import { tabStorage } from "../../utils/safeStorage";
import { FALLBACK_CAPABILITIES, parseCapabilities } from "./capabilities";
import { withRetry } from "./retry";
import { currentClearance } from "./tokens";
import { postJson } from "./transport";
import { assertWorkerCompatible } from "./workerCompat";
import type { WorkerCapabilities, WorkerSessionPayload } from "./types";

const STANDBY_TTL_MS = 300_000;
const ACTIVE_TTL_MS = 3_600_000;

interface Session extends WorkerSessionPayload {
  issuedAt: number;
  ttl: number;
}

function isFresh(candidate: Session | null): candidate is Session {
  return candidate !== null && Date.now() - candidate.issuedAt < candidate.ttl - IDLE_STANDBY_MARGIN_MS;
}

function restoreSession(): Session | null {
  const stored = tabStorage.readJson<Session>(STORAGE_KEYS.session);
  if (isFresh(stored)) return stored;
  if (stored !== null) tabStorage.removeItem(STORAGE_KEYS.session);
  return null;
}

let session: Session | null = restoreSession();
let capabilities: WorkerCapabilities | null = tabStorage.readJson<WorkerCapabilities>(STORAGE_KEYS.capabilities);

export function adoptSession(payload: WorkerSessionPayload, ttl = ACTIVE_TTL_MS): void {
  const { token, challengeKey, nonce, recipe } = payload;
  session = { token, challengeKey, nonce, recipe, issuedAt: Date.now(), ttl };
  tabStorage.writeJson(STORAGE_KEYS.session, session);
}

export function discardSession(): void {
  session = null;
  tabStorage.removeItem(STORAGE_KEYS.session);
}

export function handshake(signal?: AbortSignal): Promise<void> {
  return withRetry(async () => {
    const clearance = currentClearance();
    const payload = await postJson("/handshake", clearance ? { clearance } : {}, signal);
    assertWorkerCompatible(payload.worker_version);
    const parsed = parseCapabilities(payload.capabilities);
    if (parsed) {
      capabilities = parsed;
      tabStorage.writeJson(STORAGE_KEYS.capabilities, parsed);
    }
    adoptSession(payload, STANDBY_TTL_MS);
  }, signal);
}

export async function resolveCapabilities(signal?: AbortSignal): Promise<WorkerCapabilities> {
  if (!capabilities && !isFresh(session)) await handshake(signal);
  return capabilities ?? FALLBACK_CAPABILITIES;
}

export async function takeSession(signal?: AbortSignal): Promise<Session> {
  if (!isFresh(session)) {
    const restored = restoreSession();
    if (restored) session = restored;
    else await handshake(signal);
  }
  const active = session!;
  session = null;
  tabStorage.removeItem(STORAGE_KEYS.session);
  return active;
}
