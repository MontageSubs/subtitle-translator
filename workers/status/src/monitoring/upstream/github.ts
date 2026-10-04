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

const GITHUB_SUMMARY_URL = "https://www.githubstatus.com/api/v2/summary.json";
const MONITORED_NAME_PATTERN = /\b(?:pages|actions|git operations|repo)\b/i;
const MONITORED_UPDATE_PATTERN = /\b(?:pages|actions|git operations)\b/i;
const MONITORED_COMPONENT_KEYWORDS = ["pages", "actions", "git operations", "repo"];
const COMPONENT_STATUSES: ComponentStatus[] = ["operational", "degraded_performance", "partial_outage", "major_outage"];

export interface GitHubStatusSummary {
  pageStatus: ComponentStatus;
  actionsStatus: ComponentStatus;
  gitStatus: ComponentStatus;
  platformIndicator: StatuspageIndicator;
  description: string;
  activeIncidents?: StatuspageIncident[];
}

const nominalSummary = (description: string): GitHubStatusSummary => ({
  pageStatus: "operational",
  actionsStatus: "operational",
  gitStatus: "operational",
  platformIndicator: "none",
  description,
  activeIncidents: [],
});

function mapComponentStatus(rawStatus?: string): ComponentStatus {
  const normalized = rawStatus?.toLowerCase() as ComponentStatus | undefined;
  return normalized && COMPONENT_STATUSES.includes(normalized) ? normalized : "operational";
}

function isImpactingIncident(incident: any): boolean {
  if (MONITORED_NAME_PATTERN.test(String(incident?.name || ""))) return true;

  const affectsMonitoredComponent =
    Array.isArray(incident?.components) &&
    incident.components.some((c: any) => {
      const name = String(c?.name || "").toLowerCase();
      return MONITORED_COMPONENT_KEYWORDS.some((keyword) => name.includes(keyword));
    });
  if (affectsMonitoredComponent) return true;

  return (
    Array.isArray(incident?.incident_updates) &&
    incident.incident_updates.some((u: any) => MONITORED_UPDATE_PATTERN.test(String(u?.body || "")))
  );
}

export async function pollGitHubStatus(): Promise<GitHubStatusSummary> {
  const data = await fetchJson("GitHub", GITHUB_SUMMARY_URL);
  if (!data) return nominalSummary("GitHub status feed unreachable, assuming nominal");

  if (typeof data !== "object" || !data.status) {
    logUpstreamParseError("GitHub", GITHUB_SUMMARY_URL, "Response missing status object", JSON.stringify(data).slice(0, 300));
    return nominalSummary("GitHub status format unrecognized, assuming nominal");
  }

  const components = readList(data.components);
  const statusOf = (matches: (name: string) => boolean) => mapComponentStatus(findComponent(components, matches)?.status);

  return {
    pageStatus: statusOf((name) => name.includes("pages")),
    actionsStatus: statusOf((name) => name.includes("actions")),
    gitStatus: statusOf((name) => name.includes("git operations") || name.includes("repo")),
    platformIndicator: readIndicator(data),
    description: readDescription(data),
    activeIncidents: listActiveIncidents(data, "GitHub Service Issue", isImpactingIncident),
  };
}
