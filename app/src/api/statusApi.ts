import { STATUS_API_URL } from "../config/config";
import { APP_VERSION } from "../config/compat";
import { isVersionAtLeast } from "../utils/version";

export type IncidentSeverity = "minor" | "major" | "critical";
export type OverallStatus = "operational" | "degraded" | "major_outage" | "maintenance";

export interface StatusIncidentUpdate {
  timestamp: string;
  status: string;
  body: string;
}

export interface StatusIncident {
  id: string;
  componentId: string | string[];
  title: string;
  severity: IncidentSeverity;
  status: string;
  updates: StatusIncidentUpdate[];
}

export interface StatusSnapshot {
  summary: { overallStatus: OverallStatus; activeIncidentsCount: number };
  incidents: StatusIncident[];
}

export type StatusFetch =
  | { kind: "ok"; snapshot: StatusSnapshot }
  | { kind: "unreachable" }
  | { kind: "incompatible"; reason: string };

const FETCH_TIMEOUT_MS = 6_000;
const UNREACHABLE: StatusFetch = { kind: "unreachable" };

function readSnapshot(data: any): StatusFetch {
  if (!data?.summary || !Array.isArray(data.incidents)) return { kind: "incompatible", reason: "unrecognized status format" };
  const minClientVersion = data.meta?.minClientVersion;
  if (!isVersionAtLeast(APP_VERSION, minClientVersion)) return { kind: "incompatible", reason: `status requires app ${minClientVersion}, running ${APP_VERSION}` };
  return { kind: "ok", snapshot: { summary: data.summary, incidents: data.incidents } };
}

export async function fetchStatusSnapshot(): Promise<StatusFetch> {
  if (!STATUS_API_URL) return UNREACHABLE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(STATUS_API_URL, { signal: controller.signal, cache: "no-store" });
    return response.ok ? readSnapshot(await response.json()) : UNREACHABLE;
  } catch {
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
