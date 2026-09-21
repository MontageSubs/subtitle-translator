import { STATUS_API_URL } from "../config/config";

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

const FETCH_TIMEOUT_MS = 6_000;

export async function fetchStatusSnapshot(): Promise<StatusSnapshot | null> {
  if (!STATUS_API_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(STATUS_API_URL, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.summary || !Array.isArray(data.incidents)) return null;
    return { summary: data.summary, incidents: data.incidents };
  } catch {
    return null;
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

export function severityRank(severity: IncidentSeverity): number {
  if (severity === "critical") return 3;
  if (severity === "major") return 2;
  return 1;
}

export function highestSeverity(incidents: StatusIncident[]): IncidentSeverity {
  return incidents.reduce<IncidentSeverity>((worst, incident) => (
    severityRank(incident.severity) > severityRank(worst) ? incident.severity : worst
  ), "minor");
}
