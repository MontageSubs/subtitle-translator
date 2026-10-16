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
const NON_RUNTIME_INCIDENT_PATTERN =
  /\b(?:cron|scheduled|triggers?|api|builds?|dashboard|analytics|deployments?|billing|dns\s*update|propagation|workers?\s+(?:ai|kv|logs?|preview|assets|vpc|observability)|static\s+assets|wrangler|ai\s+gateway|vectorize|queues?|workflows?|browser\s+rendering|containers?|hyperdrive|logpush|observability|registrar|zero\s+trust|warp)\b/i;

const RUNTIME_COMPONENTS: ReadonlyArray<{ component: string; fallbackPattern: RegExp }> = [
  { component: "workers", fallbackPattern: /\b(?:workers?|edge\s*network|routing)\b/i },
  { component: "d1", fallbackPattern: /\bd1\b/i },
  { component: "pages", fallbackPattern: /\bpages\b/i },
  { component: "turnstile", fallbackPattern: /\bturnstile\b/i },
];

const affectsComponent = (incident: StatuspageIncident, component: string, fallbackPattern: RegExp): boolean =>
  incident.components.length > 0 ? incident.components.includes(component) : fallbackPattern.test(incident.name);

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
  const activeIncidents = listActiveIncidents(data, "Cloudflare Service Issue").filter((inc) =>
    RUNTIME_COMPONENTS.some(({ component, fallbackPattern }) => affectsComponent(inc, component, fallbackPattern)),
  );
  const impactingIncidents = activeIncidents.filter((inc) => !NON_RUNTIME_INCIDENT_PATTERN.test(inc.name));

  const components = readList(data.components);
  const confirmedStatusOf = (component: string): ComponentStatus => {
    const runtime = RUNTIME_COMPONENTS.find((entry) => entry.component === component)!;
    const confirmed = impactingIncidents.some((inc) => affectsComponent(inc, component, runtime.fallbackPattern));
    return confirmed ? mapComponentStatus(findComponent(components, (name) => name.trim() === component)?.status) : "operational";
  };
  const d1Status = confirmedStatusOf("d1");
  const pagesStatus = confirmedStatusOf("pages");
  const turnstileStatus = confirmedStatusOf("turnstile");
  const workersStatus = confirmedStatusOf("workers");

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
