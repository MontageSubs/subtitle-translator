import {
  pollGoogleCloudIncidents,
  GoogleCloudIncidentsSummary,
} from "../../upstream";

const CACHE_KEY = "google_cloud_incidents_promise";

export function getSharedGoogleCloudStatus(
  sharedState: Map<string, any>,
): Promise<GoogleCloudIncidentsSummary> {
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
  return sharedState.get(CACHE_KEY);
}
