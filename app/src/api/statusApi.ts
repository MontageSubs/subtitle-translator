import { reportNetworkFailure, reportNetworkSuccess } from "../lib/net/serviceReachability";
import { statusSourceUrls, rememberStatusSource } from "../lib/net/statusSources";
import { rememberModelSources } from "../lib/models/modelSources";

type IncidentSeverity = "minor" | "major" | "critical";
type OverallStatus = "operational" | "degraded" | "major_outage" | "maintenance";

interface StatusIncidentUpdate {
  timestamp: string;
  status: string;
  body: string;
}

export interface StatusIncident {
  id: string;
  componentId: string | string[];
  title: string;
  severity: IncidentSeverity;
  kind?: "maintenance";
  status: string;
  updates: StatusIncidentUpdate[];
}

interface StatusComponent {
  id: string;
  status: string;
}

export type BroadcastEndpointId = "status_site" | "relay" | "web_app" | "models_site" | "assets_site";

export type BroadcastEndpointSource = "primary" | "fallback" | "redirect_target";

export interface BroadcastEndpoint {
  id: BroadcastEndpointId;
  primaryUrl: string;
  fallbackUrl: string | null;
  recommendedUrl: string;
  recommendedSource: BroadcastEndpointSource;
}

export interface StatusSnapshot {
  summary: { overallStatus: OverallStatus; activeIncidentsCount: number };
  incidents: StatusIncident[];
  components: StatusComponent[];
  endpoints: BroadcastEndpoint[];
  minClientVersion?: string;
}

export type StatusFetch =
  | { kind: "ok"; snapshot: StatusSnapshot }
  | { kind: "unreachable" }
  | { kind: "incompatible" };

const FETCH_TIMEOUT_MS = 6_000;
const UNREACHABLE: StatusFetch = { kind: "unreachable" };
const INCOMPATIBLE: StatusFetch = { kind: "incompatible" };

const ENDPOINT_IDS: readonly string[] = ["status_site", "relay", "web_app", "models_site", "assets_site"];
const ENDPOINT_SOURCES: readonly string[] = ["primary", "fallback", "redirect_target"];

const isBroadcastEndpoint = (value: any): value is BroadcastEndpoint =>
  ENDPOINT_IDS.includes(value?.id) && ENDPOINT_SOURCES.includes(value?.recommendedSource) && typeof value.primaryUrl === "string" && typeof value.recommendedUrl === "string";

function readSnapshot(data: any): StatusFetch {
  if (!data?.summary || !Array.isArray(data.incidents)) return INCOMPATIBLE;
  const endpoints: BroadcastEndpoint[] = Array.isArray(data.endpoints) ? data.endpoints.filter(isBroadcastEndpoint) : [];
  return { kind: "ok", snapshot: { summary: data.summary, incidents: data.incidents, components: Array.isArray(data.components) ? data.components : [], endpoints, minClientVersion: data.meta?.minClientVersion } };
}

export const broadcastEndpointOf = (snapshot: StatusSnapshot, id: BroadcastEndpointId): BroadcastEndpoint | undefined => snapshot.endpoints.find((endpoint) => endpoint.id === id);

export async function fetchStatusSnapshot(url?: string): Promise<StatusFetch> {
  if (url !== undefined) return fetchSnapshotFrom(url);
  let last: StatusFetch = UNREACHABLE;
  for (const source of statusSourceUrls()) {
    last = await fetchSnapshotFrom(source);
    if (last.kind !== "unreachable") break;
  }
  if (last.kind === "ok") {
    rememberStatusSource(broadcastEndpointOf(last.snapshot, "status_site"));
    rememberModelSources(broadcastEndpointOf(last.snapshot, "models_site"));
  }
  return last;
}

async function fetchSnapshotFrom(url: string): Promise<StatusFetch> {
  if (!url) return UNREACHABLE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (response.ok) reportNetworkSuccess(url);
    return response.ok ? readSnapshot(await response.json()) : UNREACHABLE;
  } catch (error) {
    reportNetworkFailure(url, error);
    return UNREACHABLE;
  } finally {
    clearTimeout(timer);
  }
}

export function activeIncidents(snapshot: StatusSnapshot | null): StatusIncident[] {
  if (!snapshot) return [];
  return snapshot.incidents.filter((incident) => {
    if (incident.status === "resolved") return false;

    const isUpstream = Array.isArray(incident.componentId)
      ? incident.componentId.some((c) => c.startsWith("upstream_"))
      : incident.componentId.startsWith("upstream_");

    if (snapshot.summary.overallStatus === "operational" && isUpstream) {
      return false;
    }

    return true;
  });
}
