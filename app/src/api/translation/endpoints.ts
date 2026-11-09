import { WORKER_URL } from "../../config/environment";
import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";
import { broadcastEndpointOf, fetchStatusSnapshot } from "../statusApi";

const FAILOVER_THRESHOLD = 3;
const FAILOVER_HOLD_MS = 5 * 60_000;
const BROADCAST_LOOKUP_INTERVAL_MS = 5 * 60_000;

interface EndpointState {
  build: string;
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
  const initial: EndpointState = { build: WORKER_URL, primary: WORKER_URL, fallback: "", failedOverAt: 0 };
  const stored = persistentStorage.readJson<Partial<EndpointState>>(STORAGE_KEYS.endpoints) ?? {};
  if (stored.build !== WORKER_URL) return initial;
  return {
    build: WORKER_URL,
    primary: normalizeUrl(stored.primary) || initial.primary,
    fallback: normalizeUrl(stored.fallback),
    failedOverAt: Number(stored.failedOverAt) || 0,
  };
}

const state = load();
let consecutiveNetworkFailures = 0;
let broadcastLookupAt = 0;
let broadcastLookup: Promise<void> | null = null;

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

async function adoptBroadcastEndpoint(): Promise<void> {
  const result = await fetchStatusSnapshot();
  if (result.kind !== "ok") return;
  const entry = broadcastEndpointOf(result.snapshot, "relay");
  if (!entry) return;
  const recommended = normalizeUrl(entry.recommendedUrl);
  const serviceDown = result.snapshot.summary.overallStatus === "major_outage";
  const candidate = recommended && recommended !== state.primary ? recommended : serviceDown ? normalizeUrl(entry.fallbackUrl) : "";
  if (!candidate || candidate === state.primary) return;
  Object.assign(state, { fallback: candidate, failedOverAt: Date.now() });
  consecutiveNetworkFailures = 0;
  persist();
}

function lookUpBroadcastEndpoint(): void {
  if (broadcastLookup || Date.now() - broadcastLookupAt < BROADCAST_LOOKUP_INTERVAL_MS) return;
  broadcastLookupAt = Date.now();
  broadcastLookup = adoptBroadcastEndpoint().catch(() => undefined).finally(() => {
    broadcastLookup = null;
  });
}

export function recordNetworkFailure(): void {
  if (navigator.onLine === false) return;
  if (isFailedOver()) {
    state.failedOverAt = 0;
    consecutiveNetworkFailures = 0;
    persist();
    lookUpBroadcastEndpoint();
    return;
  }
  consecutiveNetworkFailures += 1;
  if (consecutiveNetworkFailures < FAILOVER_THRESHOLD) return;
  consecutiveNetworkFailures = 0;
  if (!state.fallback) {
    lookUpBroadcastEndpoint();
    return;
  }
  state.failedOverAt = Date.now();
  persist();
}

window.addEventListener("online", recordNetworkSuccess);
