import { WORKER_URL } from "../../config/config";
import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";

const FAILOVER_THRESHOLD = 3;
const FAILOVER_HOLD_MS = 5 * 60_000;

interface EndpointState {
  primary: string;
  fallback: string;
  failedOverAt: number;
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin + url.pathname.replace(/\/+$/, "") : "";
  } catch {
    return "";
  }
}

function load(): EndpointState {
  const initial: EndpointState = { primary: WORKER_URL, fallback: "", failedOverAt: 0 };
  const stored = persistentStorage.readJson<Partial<EndpointState>>(STORAGE_KEYS.endpoints) ?? {};
  return {
    primary: normalizeUrl(stored.primary) || initial.primary,
    fallback: normalizeUrl(stored.fallback),
    failedOverAt: Number(stored.failedOverAt) || 0,
  };
}

const state = load();
let consecutiveNetworkFailures = 0;

function persist(): void {
  persistentStorage.writeJson(STORAGE_KEYS.endpoints, state);
}

const isFailedOver = (): boolean => state.failedOverAt > 0 && Date.now() - state.failedOverAt < FAILOVER_HOLD_MS;

export function currentEndpoint(): string {
  return isFailedOver() && state.fallback ? state.fallback : state.primary;
}

export function recordEndpoints(payload: { service_url?: unknown; fallback_url?: unknown } | undefined): void {
  consecutiveNetworkFailures = 0;
  const service = normalizeUrl(payload?.service_url);
  const fallback = normalizeUrl(payload?.fallback_url);
  const failedOver = isFailedOver();
  const nextPrimary = !failedOver && service ? service : state.primary;
  const nextFallback = fallback || state.fallback;
  const nextFailedOverAt = failedOver ? state.failedOverAt : 0;
  if (nextPrimary === state.primary && nextFallback === state.fallback && nextFailedOverAt === state.failedOverAt) return;
  Object.assign(state, { primary: nextPrimary, fallback: nextFallback, failedOverAt: nextFailedOverAt });
  persist();
}

export function recordNetworkSuccess(): void {
  consecutiveNetworkFailures = 0;
}

export function recordNetworkFailure(): void {
  if (navigator.onLine === false) return;
  if (isFailedOver()) {
    state.failedOverAt = 0;
    consecutiveNetworkFailures = 0;
    persist();
    return;
  }
  consecutiveNetworkFailures += 1;
  if (consecutiveNetworkFailures < FAILOVER_THRESHOLD || !state.fallback) return;
  consecutiveNetworkFailures = 0;
  state.failedOverAt = Date.now();
  persist();
}

window.addEventListener("online", recordNetworkSuccess);
