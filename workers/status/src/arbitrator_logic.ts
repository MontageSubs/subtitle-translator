import {
  Incident, IncidentStatus, ComponentStatus, OverallStatus
} from "./types";

export function getExistingIncident(activeExistingIncidents: Map<string, Incident>, compId: string): Incident | undefined {
  for (const inc of activeExistingIncidents.values()) {
    if (Array.isArray(inc.componentId)) {
      if (inc.componentId.includes(compId)) return inc;
    } else {
      if (inc.componentId === compId) return inc;
    }
  }
  return undefined;
}
