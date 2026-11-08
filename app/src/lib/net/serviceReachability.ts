import { STATS_URL, STATUS_API_URL, STATUS_FALLBACK_API_URL, WORKER_URL } from "../../config/environment";
import { fetchStatusSnapshot } from "../../api/statusApi";

type AccessPhase = "idle" | "checking" | "blocked" | "cleared";

const RECHECK_INTERVAL_MS = 5 * 60_000;

const originOf = (url: string): string | null => {
  try {
    return url ? new URL(url, location.origin).origin : null;
  } catch {
    return null;
  }
};

const primaryOrigins = (): ReadonlySet<string> => {
  const [primaryModelSource] = __MODEL_SOURCES__;
  return new Set([WORKER_URL, STATS_URL, STATUS_API_URL, primaryModelSource ?? ""].flatMap((url) => originOf(url) ?? []));
};

const listeners = new Set<() => void>();
let phase: AccessPhase = "idle";
let lastCheckAt = 0;

function transition(next: AccessPhase): void {
  if (phase === next) return;
  phase = next;
  listeners.forEach((listener) => listener());
}

async function confirmServiceIsUp(): Promise<void> {
  transition("checking");
  lastCheckAt = Date.now();
  const result = await fetchStatusSnapshot(STATUS_FALLBACK_API_URL);
  transition(result.kind === "ok" && result.snapshot.summary.overallStatus === "operational" ? "blocked" : "cleared");
}

const isPrimaryServiceUrl = (url: string): boolean => {
  const origin = originOf(url);
  return origin !== null && primaryOrigins().has(origin);
};

export const isServiceAccessBlocked = (): boolean => phase === "blocked";

export function subscribeServiceAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function reportNetworkFailure(url: string, error: unknown): void {
  if (typeof document === "undefined" || !STATUS_FALLBACK_API_URL || !(error instanceof TypeError) || navigator.onLine === false) return;
  if (!isPrimaryServiceUrl(url) || phase === "checking" || phase === "blocked" || Date.now() - lastCheckAt < RECHECK_INTERVAL_MS) return;
  void confirmServiceIsUp();
}

export function reportNetworkSuccess(url: string): void {
  if (phase === "blocked" && isPrimaryServiceUrl(url)) transition("cleared");
}
