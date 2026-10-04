import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact, ProviderIncident } from "./shared/types";
import { pollGitHubStatus, GitHubStatusSummary } from "../monitoring/upstream/github";
import { probeFrontend } from "../monitoring/probe";
import { ComponentStatus, ProbeResult } from "../types";

const UNREACHABLE_SUMMARY: GitHubStatusSummary = {
  pageStatus: "operational",
  actionsStatus: "operational",
  gitStatus: "operational",
  platformIndicator: "none",
  description: "GitHub status unreachable",
  activeIncidents: [],
};

const isPageIncident = (name: string): boolean => /\bpages\b/i.test(name);

function evaluateFrontend(
  frontendProbe: ProbeResult,
  summary: GitHubStatusSummary,
): { status: ComponentStatus; coreImpact: ProviderCoreImpact } {
  const { pageStatus, actionsStatus, gitStatus } = summary;

  if (!frontendProbe.success) {
    return pageStatus === "major_outage"
      ? {
          status: "major_outage",
          coreImpact: {
            affected: true,
            status: "major_outage",
            reason: "Frontend probe failure confirmed by GitHub Pages outage",
          },
        }
      : {
          status: "degraded_performance",
          coreImpact: { affected: true, status: "degraded_performance", reason: "Frontend probe check failed" },
        };
  }

  const isDegraded =
    pageStatus === "major_outage" ||
    pageStatus === "degraded_performance" ||
    pageStatus === "partial_outage" ||
    actionsStatus !== "operational" ||
    gitStatus !== "operational";
  return { status: isDegraded ? "degraded_performance" : "operational", coreImpact: { affected: false, status: "operational" } };
}

function toProviderIncidents(summary: GitHubStatusSummary, coreImpact: ProviderCoreImpact): ProviderIncident[] {
  const incidents: ProviderIncident[] = (Array.isArray(summary.activeIncidents) ? summary.activeIncidents : []).map((inc) => ({
    id: inc.id,
    name: inc.name,
    status: inc.status,
    impact: inc.impact,
    components:
      isPageIncident(inc.name) && coreImpact.affected ? ["core_infrastructure", "upstream_github"] : ["upstream_github"],
    createdAt: inc.startedAt,
  }));

  if (coreImpact.affected && incidents.length === 0) {
    incidents.push({
      name: "GitHub Pages Edge Delivery Disruption",
      status: "investigating",
      impact: coreImpact.status === "major_outage" ? "major" : "minor",
      components: ["core_infrastructure", "upstream_github"],
    });
  }
  return incidents;
}

export const githubProvider = defineProvider(
  {
    id: "upstream_github",
    name: "GitHub Platform Infrastructure",
    group: "infrastructure_dependencies",
    referenceUrl: "https://www.githubstatus.com/",
  },
  async (_env, context) => {
    const [ghStatus, frontendProbe] = await Promise.all([
      pollGitHubStatus().catch((): GitHubStatusSummary => ({ ...UNREACHABLE_SUMMARY, activeIncidents: [] })),
      probeFrontend(context.mainSiteUrl).catch(
        (): ProbeResult => ({
          componentId: "web_app_frontend",
          success: false,
          httpStatus: 0,
          latencyMs: 0,
          errorType: "network_error",
        }),
      ),
    ]);

    const { status, coreImpact } = evaluateFrontend(frontendProbe, ghStatus);
    return {
      status,
      activeIncidents: toProviderIncidents(ghStatus, coreImpact),
      coreImpact,
      raw: { ghStatus, frontendProbe },
    };
  },
);
