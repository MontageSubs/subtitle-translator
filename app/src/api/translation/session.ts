import { MIN_WORKER_VERSION } from "../../config/compat";
import { STORAGE_KEYS } from "../../config/storage";
import { tabStorage } from "../../utils/safeStorage";
import { isVersionAtLeast } from "../../utils/version";
import { WorkerRequestError } from "./errors";
import { FALLBACK_CAPABILITIES, parseCapabilities } from "./capabilities";
import { buildHello } from "./hello";
import { recordInteractionFailure } from "./lastStatus";
import { withRetry } from "./retry";
import { adoptSession, hasFreshSession, takeFreshSession, type Session } from "./sessionStore";
import { currentClearance } from "./tokens";
import { postJson } from "./transport";
import type { WorkerCapabilities } from "./types";

function assertWorkerCompatible(workerVersion: unknown): void {
  if (isVersionAtLeast(workerVersion, MIN_WORKER_VERSION)) return;
  const error = new WorkerRequestError("worker_outdated", { code: "worker_outdated" });
  recordInteractionFailure(error);
  throw error;
}

let capabilities: WorkerCapabilities | null = tabStorage.readJson<WorkerCapabilities>(STORAGE_KEYS.capabilities);

export function openSession(signal?: AbortSignal): Promise<void> {
  return withRetry(async () => {
    if (hasFreshSession()) return;
    const clearance = currentClearance();
    const payload = await postJson("/session", { ...(clearance ? { clearance } : {}), ...(await buildHello()) }, signal);
    assertWorkerCompatible(payload.worker_version);
    const parsed = parseCapabilities(payload.capabilities);
    if (parsed) {
      capabilities = parsed;
      tabStorage.writeJson(STORAGE_KEYS.capabilities, parsed);
    }
    adoptSession(payload);
  }, signal, false);
}

export async function resolveCapabilities(signal?: AbortSignal): Promise<WorkerCapabilities> {
  if (!capabilities && !hasFreshSession()) await openSession(signal);
  return capabilities ?? FALLBACK_CAPABILITIES;
}

export async function takeSession(signal?: AbortSignal): Promise<Session> {
  const ready = takeFreshSession();
  if (ready) return ready;
  await openSession(signal);
  return takeFreshSession()!;
}
