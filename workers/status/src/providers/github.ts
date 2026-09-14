import { StatusProvider, ProviderReport, ProviderIncident, ProviderCoreImpact } from "./shared/types";
import { pollGitHubStatus, GitHubStatusSummary } from "../upstream";
import { probeFrontend } from "../probe";
import { ComponentStatus } from "../types";

function isPageIncident(name: string): boolean {
  return /\bpages\b/i.test(name);
}

export const githubProvider: StatusProvider = {
  id: "upstream_github",
  name: "GitHub Platform Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://www.githubstatus.com/",
  execute: async (env, context): Promise<ProviderReport> => {
    const [ghStatus, frontendProbe] = await Promise.all([
      pollGitHubStatus().catch(
        (): GitHubStatusSummary => ({
          pageStatus: "operational",
          actionsStatus: "operational",
          gitStatus: "operational",
          platformIndicator: "none",
          description: "GitHub status unreachable",
          activeIncidents: [],
        }),
      ),
      probeFrontend(context.mainSiteUrl).catch(() => ({
        componentId: "web_app_frontend",
        success: false,
        httpStatus: 0,
        latencyMs: 0,
        errorType: "network_error" as const,
      })),
    ]);

    const pageStatus = ghStatus?.pageStatus || "operational";
    const actionsStatus = ghStatus?.actionsStatus || "operational";
    const gitStatus = ghStatus?.gitStatus || "operational";

    let status: ComponentStatus = "operational";
    let coreImpact: ProviderCoreImpact = {
      affected: false,
      status: "operational",
    };

    if (!frontendProbe.success) {
      if (pageStatus === "major_outage") {
        status = "major_outage";
        coreImpact = {
          affected: true,
          status: "major_outage",
          reason: "Frontend probe failure confirmed by GitHub Pages outage",
        };
      } else {
        status = "degraded_performance";
        coreImpact = {
          affected: true,
          status: "degraded_performance",
          reason: "Frontend probe check failed",
        };
      }
    } else {
      if (pageStatus === "major_outage") {
        status = "degraded_performance";
      } else if (
        pageStatus === "degraded_performance" ||
        pageStatus === "partial_outage" ||
        actionsStatus !== "operational" ||
        gitStatus !== "operational"
      ) {
        status = "degraded_performance";
      }
    }

    const rawIncidents = Array.isArray(ghStatus?.activeIncidents)
      ? ghStatus.activeIncidents
      : [];
    const activeIncidents: ProviderIncident[] = rawIncidents.map((inc) => {
      const isPages = isPageIncident(inc.name);
      const components =
        isPages && coreImpact.affected
          ? ["core_infrastructure", "upstream_github"]
          : ["upstream_github"];

      return {
        id: inc.id,
        name: inc.name,
        status: inc.status,
        impact: inc.impact,
        components,
        createdAt: inc.startedAt,
      };
    });

    if (coreImpact.affected && activeIncidents.length === 0) {
      activeIncidents.push({
        id: "inc_github_edge_probe_failure",
        name: "GitHub Pages Edge Delivery Disruption",
        status: "investigating",
        impact: coreImpact.status === "major_outage" ? "major" : "minor",
        components: ["core_infrastructure", "upstream_github"],
      });
    }

    return {
      id: "upstream_github",
      name: "GitHub Platform Infrastructure",
      group: "infrastructure_dependencies",
      status,
      referenceUrl: "https://www.githubstatus.com/",
      activeIncidents,
      coreImpact,
      raw: { ghStatus, frontendProbe },
    };
  },
};
