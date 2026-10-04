import { ComponentStatus } from "../../types";
import { logUpstreamParseError } from "../../logger";
import { fetchJson } from "./fetch";
import {
  StatuspageIncident,
  StatuspageIndicator,
  findComponent,
  listActiveIncidents,
  readDescription,
  readIndicator,
  readList,
} from "./statuspage";

const CLOUDFLARE_SUMMARY_URL = "https://www.cloudflarestatus.com/api/v2/summary.json";
const IMPACTING_INCIDENT_PATTERN = /\b(?:workers?|d1|pages|turnstile)\b/i;

export interface CloudflareStatusSummary {
  status: ComponentStatus;
  workersStatus: ComponentStatus;
  d1Status: ComponentStatus;
  pagesStatus: ComponentStatus;
  turnstileStatus: ComponentStatus;
  indicator: StatuspageIndicator;
  description: string;
  activeIncidents: StatuspageIncident[];
}

const NOMINAL_SUMMARY: CloudflareStatusSummary = {
  status: "operational",
  workersStatus: "operational",
  d1Status: "operational",
  pagesStatus: "operational",
  turnstileStatus: "operational",
  indicator: "none",
  description: "Cloudflare status operational",
  activeIncidents: [],
};

function mapComponentStatus(rawStatus?: unknown): ComponentStatus {
  const normalized = String(rawStatus || "").toLowerCase();
  if (normalized === "major_outage") return "major_outage";
  return normalized === "partial_outage" || normalized === "degraded_performance" ? "degraded_performance" : "operational";
}

function deriveOverallStatus(
  componentStatuses: ComponentStatus[],
  impactingIncidents: StatuspageIncident[],
  indicator: StatuspageIndicator,
): ComponentStatus {
  const hasImpact = impactingIncidents.length > 0;
  const hasMajorIncident = impactingIncidents.some((inc) => inc.impact === "major" || inc.impact === "critical");
  const hasMinorIncident = impactingIncidents.some((inc) => inc.impact === "minor");

  if (componentStatuses.includes("major_outage") || hasMajorIncident || (indicator === "critical" && hasImpact)) {
    return "major_outage";
  }
  if (componentStatuses.includes("degraded_performance") || hasMinorIncident || (indicator === "major" && hasImpact)) {
    return "degraded_performance";
  }
  return "operational";
}

export async function pollCloudflareStatus(): Promise<CloudflareStatusSummary> {
  const data = await fetchJson("Cloudflare", CLOUDFLARE_SUMMARY_URL);

  if (!data || typeof data !== "object" || !data.status) {
    if (data !== null) {
      logUpstreamParseError("Cloudflare", CLOUDFLARE_SUMMARY_URL, "Response missing status object", JSON.stringify(data).slice(0, 300));
    }
    return { ...NOMINAL_SUMMARY, activeIncidents: [] };
  }

  const indicator = readIndicator(data);
  const activeIncidents = listActiveIncidents(data, "Cloudflare Service Issue");
  const impactingIncidents = activeIncidents.filter((inc) => IMPACTING_INCIDENT_PATTERN.test(inc.name));

  const components = readList(data.components);
  const statusOf = (target: string) => mapComponentStatus(findComponent(components, (name) => name.trim() === target)?.status);

  const d1Status = statusOf("d1");
  const pagesStatus = statusOf("pages");
  const turnstileStatus = statusOf("turnstile");
  const rawWorkersStatus = statusOf("workers");
  const workersStatus = rawWorkersStatus !== "operational" && impactingIncidents.length === 0 ? "operational" : rawWorkersStatus;

  return {
    status: deriveOverallStatus([workersStatus, d1Status, pagesStatus, turnstileStatus], impactingIncidents, indicator),
    workersStatus,
    d1Status,
    pagesStatus,
    turnstileStatus,
    indicator,
    description: readDescription(data),
    activeIncidents,
  };
}
