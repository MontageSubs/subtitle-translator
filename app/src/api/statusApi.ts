import { STATUS_API_URL } from "../config/config";

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
  status: string;
  updates: StatusIncidentUpdate[];
}

interface StatusComponent {
  id: string;
  status: string;
}

export interface StatusSnapshot {
  summary: { overallStatus: OverallStatus; activeIncidentsCount: number };
  incidents: StatusIncident[];
  components: StatusComponent[];
  minClientVersion?: string;
}

export type StatusFetch =
  | { kind: "ok"; snapshot: StatusSnapshot }
  | { kind: "unreachable" }
  | { kind: "incompatible" };

const FETCH_TIMEOUT_MS = 6_000;
const UNREACHABLE: StatusFetch = { kind: "unreachable" };
const INCOMPATIBLE: StatusFetch = { kind: "incompatible" };

function readSnapshot(data: any): StatusFetch {
  if (!data?.summary || !Array.isArray(data.incidents)) return INCOMPATIBLE;
  return { kind: "ok", snapshot: { summary: data.summary, incidents: data.incidents, components: Array.isArray(data.components) ? data.components : [], minClientVersion: data.meta?.minClientVersion } };
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
