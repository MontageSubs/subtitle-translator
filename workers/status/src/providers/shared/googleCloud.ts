import { pollGoogleCloudIncidents, GoogleCloudIncidentsSummary } from "../../monitoring/upstream/googleCloud";
import { ProviderIncident } from "./types";

const CACHE_KEY = "google_cloud_incidents_promise";

export function getSharedGoogleCloudStatus(sharedState: Map<string, any>): Promise<GoogleCloudIncidentsSummary> {
  if (!sharedState.has(CACHE_KEY)) {
    const promise = pollGoogleCloudIncidents().catch(
      (): GoogleCloudIncidentsSummary => ({
        translationApiStatus: "operational",
        infraStatus: "operational",
        activeIncidents: [],
      }),
    );
    sharedState.set(CACHE_KEY, promise);
  }
  return sharedState.get(CACHE_KEY)!;
}

export function toProviderIncidents(
  incidents: Array<{ id: string; title: string; severity: string }> | undefined,
  componentId: string,
): ProviderIncident[] {
  return (Array.isArray(incidents) ? incidents : []).map((inc) => ({
    id: inc.id,
    name: inc.title,
    impact: inc.severity,
    components: [componentId],
  }));
}
