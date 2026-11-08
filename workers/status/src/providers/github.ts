import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact, ProviderIncident } from "./shared/types";
import { pollGitHubStatus, GitHubStatusSummary } from "../monitoring/upstream/github";
import { ComponentStatus } from "../types";

const UNREACHABLE_SUMMARY: GitHubStatusSummary = {
  pageStatus: "operational",
  actionsStatus: "operational",
  gitStatus: "operational",
  platformIndicator: "none",
  description: "GitHub status unreachable",
  activeIncidents: [],
};

const NO_CORE_IMPACT: ProviderCoreImpact = { affected: false, status: "operational" };

function evaluateStatus({ pageStatus, actionsStatus, gitStatus }: GitHubStatusSummary): ComponentStatus {
  const isDegraded =
    pageStatus === "major_outage" ||
    pageStatus === "degraded_performance" ||
    pageStatus === "partial_outage" ||
    actionsStatus !== "operational" ||
    gitStatus !== "operational";
  return isDegraded ? "degraded_performance" : "operational";
}

const toProviderIncidents = (summary: GitHubStatusSummary): ProviderIncident[] =>
  (Array.isArray(summary.activeIncidents) ? summary.activeIncidents : []).map((inc) => ({
    id: inc.id,
    name: inc.name,
    status: inc.status,
    impact: inc.impact,
    components: ["upstream_github"],
    createdAt: inc.startedAt,
  }));

export const githubProvider = defineProvider(
  {
    id: "upstream_github",
    name: "GitHub Platform Infrastructure",
    group: "infrastructure_dependencies",
    referenceUrl: "https://www.githubstatus.com/",
  },
  async () => {
    const summary = await pollGitHubStatus().catch((): GitHubStatusSummary => ({ ...UNREACHABLE_SUMMARY, activeIncidents: [] }));
    return {
      status: evaluateStatus(summary),
      activeIncidents: toProviderIncidents(summary),
      coreImpact: NO_CORE_IMPACT,
      raw: summary,
    };
  },
);
