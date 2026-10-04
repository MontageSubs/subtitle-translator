export type StatuspageIndicator = "none" | "minor" | "major" | "critical";

export interface StatuspageIncident {
  id: string;
  name: string;
  status: string;
  impact: string;
  startedAt: string;
}

export const readIndicator = (data: any): StatuspageIndicator => (data.status?.indicator || "none") as StatuspageIndicator;

export const readDescription = (data: any): string => data.status?.description || "All Systems Operational";

export const readList = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export function isActiveIncident(incident: any): boolean {
  if (!incident || incident.resolved_at) return false;
  const status = String(incident.status || "").toLowerCase();
  return status !== "resolved" && status !== "completed";
}

function toStatuspageIncident(incident: any, defaultName: string): StatuspageIncident {
  return {
    id: String(incident.id || ""),
    name: String(incident.name || defaultName),
    status: String(incident.status || "investigating"),
    impact: String(incident.impact || "minor"),
    startedAt: String(incident.started_at || incident.created_at || new Date().toISOString()),
  };
}

export function listActiveIncidents(data: any, defaultName: string, accepts: (raw: any) => boolean = () => true): StatuspageIncident[] {
  return readList(data.incidents)
    .filter(isActiveIncident)
    .filter(accepts)
    .map((incident) => toStatuspageIncident(incident, defaultName));
}

export const findComponent = (components: any[], matches: (name: string) => boolean): any =>
  components.find((c: any) => typeof c.name === "string" && matches(c.name.toLowerCase()));
