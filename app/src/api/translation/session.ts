import { MIN_WORKER_VERSION } from "../../config/compat";
import { IDLE_STANDBY_MARGIN_MS } from "../../config/environment";
import { STORAGE_KEYS } from "../../config/storage";
import { tabStorage } from "../../utils/safeStorage";
import { isVersionAtLeast } from "../../utils/version";
import { WorkerRequestError } from "./errors";
import { FALLBACK_CAPABILITIES, parseCapabilities } from "./capabilities";
import { withRetry } from "./retry";
import { currentClearance } from "./tokens";
import { postJson } from "./transport";
import type { WorkerCapabilities, WorkerSessionPayload } from "./types";

function assertWorkerCompatible(workerVersion: unknown): void {
  if (!isVersionAtLeast(workerVersion, MIN_WORKER_VERSION)) throw new WorkerRequestError("worker_outdated", { code: "worker_outdated" });
}

interface Session extends Omit<WorkerSessionPayload, "ttl_ms"> {
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

export function adoptSession(payload: WorkerSessionPayload): void {
  const { token, challengeKey, nonce, recipe, ttl_ms: ttl } = payload;
  session = { token, challengeKey, nonce, recipe, issuedAt: Date.now(), ttl };
  tabStorage.writeJson(STORAGE_KEYS.session, session);
}

export function discardSession(): void {
  session = null;
  tabStorage.removeItem(STORAGE_KEYS.session);
}

export function openSession(signal?: AbortSignal): Promise<void> {
  return withRetry(async () => {
    const clearance = currentClearance();
    const payload = await postJson("/session", clearance ? { clearance } : {}, signal);
    assertWorkerCompatible(payload.worker_version);
    const parsed = parseCapabilities(payload.capabilities);
    if (parsed) {
      capabilities = parsed;
      tabStorage.writeJson(STORAGE_KEYS.capabilities, parsed);
    }
    adoptSession(payload);
  }, signal);
}

export async function resolveCapabilities(signal?: AbortSignal): Promise<WorkerCapabilities> {
  if (!capabilities && !isFresh(session)) await openSession(signal);
  return capabilities ?? FALLBACK_CAPABILITIES;
}

export async function takeSession(signal?: AbortSignal): Promise<Session> {
  if (!isFresh(session)) {
    const restored = restoreSession();
    if (restored) session = restored;
    else await openSession(signal);
  }
  const active = session!;
  session = null;
  tabStorage.removeItem(STORAGE_KEYS.session);
  return active;
}
