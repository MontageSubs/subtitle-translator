import { WORKER_URL } from "../../config/environment";
import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";
import { recommendedUrlOf } from "../broadcastEndpoint";
import { broadcastEndpointOf, fetchStatusSnapshot } from "../statusApi";
import { isRescueChannel } from "./channel";

const FAILOVER_THRESHOLD = 3;
const FAILOVER_HOLD_MS = 5 * 60_000;
const BROADCAST_LOOKUP_INTERVAL_MS = 5 * 60_000;

interface EndpointGroup {
  primary: string;
  fallback: string;
  failedOverAt: number;
}

interface EndpointState extends EndpointGroup {
  build: string;
  rescue: EndpointGroup;
}

export interface EndpointPayload {
  service_url?: unknown;
  fallback_url?: unknown;
  rescue_url?: unknown;
  rescue_fallback_url?: unknown;
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

const restoreGroup = (stored: Partial<EndpointGroup> | undefined, initialPrimary: string): EndpointGroup => ({
  primary: normalizeUrl(stored?.primary) || initialPrimary,
  fallback: normalizeUrl(stored?.fallback),
  failedOverAt: Number(stored?.failedOverAt) || 0,
});

function load(): EndpointState {
  const stored = persistentStorage.readJson<Partial<EndpointState>>(STORAGE_KEYS.endpoints) ?? {};
  const current: Partial<EndpointState> = stored.build === WORKER_URL ? stored : {};
  return { build: WORKER_URL, ...restoreGroup(current, WORKER_URL), rescue: restoreGroup(current.rescue, "") };
}

const state = load();
const networkFailures = new WeakMap<EndpointGroup, number>();
let broadcastLookupAt = 0;
let broadcastLookup: Promise<void> | null = null;

function persist(): void {
  persistentStorage.writeJson(STORAGE_KEYS.endpoints, state);
}

const isFailedOver = (group: EndpointGroup): boolean => group.failedOverAt > 0 && Date.now() - group.failedOverAt < FAILOVER_HOLD_MS;

const activeGroup = (): EndpointGroup => (isRescueChannel() && state.rescue.primary ? state.rescue : state);

export const hasRescueEndpoint = (): boolean => state.rescue.primary !== "";

export function currentEndpoint(): string {
  const group = activeGroup();
  return isFailedOver(group) && group.fallback ? group.fallback : group.primary;
}

function adoptAddresses(group: EndpointGroup, primary: string, fallback: string): boolean {
  const failedOver = isFailedOver(group) && fallback !== "";
  const next: EndpointGroup = {
    primary: !failedOver && primary ? primary : group.primary,
    fallback,
    failedOverAt: failedOver ? group.failedOverAt : 0,
  };
  if (next.primary === group.primary && next.fallback === group.fallback && next.failedOverAt === group.failedOverAt) return false;
  Object.assign(group, next);
  return true;
}

function adoptRescueAddresses(primary: string, fallback: string): boolean {
  if (primary) return adoptAddresses(state.rescue, primary, fallback);
  if (!hasRescueEndpoint()) return false;
  state.rescue = restoreGroup(undefined, "");
  return true;
}

export function recordEndpoints(payload: EndpointPayload | undefined): void {
  recordNetworkSuccess();
  const service = normalizeUrl(payload?.service_url);
  const mainChanged = adoptAddresses(state, service, normalizeUrl(payload?.fallback_url) || state.fallback);
  const rescueChanged = service !== "" && adoptRescueAddresses(normalizeUrl(payload?.rescue_url), normalizeUrl(payload?.rescue_fallback_url));
  if (mainChanged || rescueChanged) persist();
}

export function recordNetworkSuccess(): void {
  networkFailures.delete(activeGroup());
}

async function adoptBroadcastEndpoint(): Promise<void> {
  const result = await fetchStatusSnapshot();
  if (result.kind !== "ok") return;
  const entry = broadcastEndpointOf(result.snapshot, "service");
  if (!entry) return;
  const recommended = normalizeUrl(recommendedUrlOf(entry));
  const serviceDown = result.snapshot.summary.overallStatus === "major_outage";
  const candidate = recommended && recommended !== state.primary ? recommended : serviceDown ? normalizeUrl(entry.fallbackUrl) : "";
  if (!candidate || candidate === state.primary) return;
  Object.assign(state, { fallback: candidate, failedOverAt: Date.now() });
  networkFailures.delete(state);
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
  const group = activeGroup();
  const isMain = group === state;
  if (isFailedOver(group)) {
    group.failedOverAt = 0;
    networkFailures.delete(group);
    persist();
    if (isMain) lookUpBroadcastEndpoint();
    return;
  }
  const failures = (networkFailures.get(group) ?? 0) + 1;
  networkFailures.set(group, failures);
  if (failures < FAILOVER_THRESHOLD) return;
  networkFailures.delete(group);
  if (!group.fallback) {
    if (isMain) lookUpBroadcastEndpoint();
    return;
  }
  group.failedOverAt = Date.now();
  persist();
}

window.addEventListener("online", recordNetworkSuccess);
