import { ComponentStatus } from "../../types";
import { logUpstreamParseError } from "../../logger";
import { fetchJson } from "./fetch";

const GOOGLE_CLOUD_INCIDENTS_URL = "https://status.cloud.google.com/incidents.json";
const GOOGLE_CLOUD_BASE_URL = "https://status.cloud.google.com";
const TRANSLATION_PATTERN = /\b(?:cloud\s*translation|translation|translate)\b/i;

export interface GoogleCloudIncident {
  id: string;
  title: string;
  severity: string;
  url: string;
}

export interface GoogleCloudIncidentsSummary {
  translationApiStatus: ComponentStatus;
  infraStatus: ComponentStatus;
  activeIncidents: GoogleCloudIncident[];
}

const isActiveIncident = (item: any): boolean =>
  Boolean(item) && !(item.end && String(item.end).trim() !== "") && item.most_recent_update?.status !== "AVAILABLE";

function incidentSearchText(incident: any): string {
  const affectedTitles = Array.isArray(incident.affected_products)
    ? incident.affected_products
        .map((p: any) => `${p.title || ""} ${p.current_title || ""}`)
        .join(" ")
        .toLowerCase()
    : "";
  const serviceName = String(incident.service_name || "").toLowerCase();
  const externalDesc = String(incident.external_desc || "").toLowerCase();
  return `${serviceName} ${externalDesc} ${affectedTitles}`;
}

function resolveIncidentUrl(uri: unknown): string {
  if (!uri) return GOOGLE_CLOUD_BASE_URL;
  const value = String(uri);
  if (value.startsWith("http")) return value;
  return `${GOOGLE_CLOUD_BASE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

function isMajorImpact(incident: any, severity: string): boolean {
  return String(incident.status_impact || "").toUpperCase() === "SERVICE_OUTAGE" || severity === "high" || severity === "critical";
}

export async function pollGoogleCloudIncidents(): Promise<GoogleCloudIncidentsSummary> {
  const data = await fetchJson<any[]>("GoogleCloud", GOOGLE_CLOUD_INCIDENTS_URL);
  if (!Array.isArray(data)) {
    if (data !== null) {
      logUpstreamParseError("GoogleCloud", GOOGLE_CLOUD_INCIDENTS_URL, "Payload is not an array of incidents", JSON.stringify(data).slice(0, 300));
    }
    return { translationApiStatus: "operational", infraStatus: "operational", activeIncidents: [] };
  }

  let translationStatus: ComponentStatus = "operational";
  const activeIncidents: GoogleCloudIncident[] = [];

  for (const incident of data.filter(isActiveIncident)) {
    if (!TRANSLATION_PATTERN.test(incidentSearchText(incident))) continue;

    const severity = String(incident.severity || "").toLowerCase();
    activeIncidents.push({
      id: String(incident.id || incident.number || ""),
      title: String(incident.external_desc || incident.service_name || "Google Cloud Translation Advisory"),
      severity: severity || "medium",
      url: resolveIncidentUrl(incident.uri),
    });

    if (isMajorImpact(incident, severity)) translationStatus = "major_outage";
    else if (translationStatus !== "major_outage") translationStatus = "degraded_performance";
  }

  return { translationApiStatus: translationStatus, infraStatus: translationStatus, activeIncidents };
}
