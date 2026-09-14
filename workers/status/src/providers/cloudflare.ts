import {
  StatusProvider,
  ProviderReport,
  ProviderIncident,
  ProviderCoreImpact,
} from "./shared/types";
import { pollCloudflareStatus, CloudflareStatusSummary } from "../upstream";

export const cloudflareProvider: StatusProvider = {
  id: "upstream_cloudflare",
  name: "Cloudflare Edge Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://www.cloudflarestatus.com/",
  execute: async (): Promise<ProviderReport> => {
    const cfStatus: CloudflareStatusSummary = await pollCloudflareStatus().catch(
      (): CloudflareStatusSummary => ({
        status: "operational",
        workersStatus: "operational",
        d1Status: "operational",
        pagesStatus: "operational",
        turnstileStatus: "operational",
        indicator: "none",
        description: "Cloudflare status operational",
        activeIncidents: [],
      }),
    );

    let coreImpact: ProviderCoreImpact = {
      affected: false,
      status: "operational",
    };
    if (cfStatus.workersStatus === "major_outage") {
      coreImpact = {
        affected: true,
        status: "major_outage",
        reason: "Cloudflare Workers edge outage",
      };
    } else if (cfStatus.workersStatus === "degraded_performance") {
      coreImpact = {
        affected: true,
        status: "degraded_performance",
        reason: "Cloudflare Workers edge degradation",
      };
    }

    const rawIncidents = Array.isArray(cfStatus.activeIncidents)
      ? cfStatus.activeIncidents
      : [];
    const activeIncidents: ProviderIncident[] = rawIncidents.map((inc) => ({
      id: inc.id,
      name: inc.name,
      status: inc.status,
      impact: inc.impact,
      components: ["upstream_cloudflare"],
    }));

    return {
      id: "upstream_cloudflare",
      name: "Cloudflare Edge Infrastructure",
      group: "infrastructure_dependencies",
      status: cfStatus.status || "operational",
      referenceUrl: "https://www.cloudflarestatus.com/",
      activeIncidents,
      coreImpact,
      raw: cfStatus,
    };
  },
};
