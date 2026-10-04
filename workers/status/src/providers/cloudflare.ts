import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact } from "./shared/types";
import { pollCloudflareStatus, CloudflareStatusSummary } from "../monitoring/upstream/cloudflare";

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

function deriveCoreImpact(summary: CloudflareStatusSummary): ProviderCoreImpact {
  if (summary.workersStatus === "major_outage") {
    return { affected: true, status: "major_outage", reason: "Cloudflare Workers edge outage" };
  }
  if (summary.workersStatus === "degraded_performance") {
    return { affected: true, status: "degraded_performance", reason: "Cloudflare Workers edge degradation" };
  }
  return { affected: false, status: "operational" };
}

export const cloudflareProvider = defineProvider(
  {
    id: "upstream_cloudflare",
    name: "Cloudflare Edge Infrastructure",
    group: "infrastructure_dependencies",
    referenceUrl: "https://www.cloudflarestatus.com/",
  },
  async () => {
    const summary = await pollCloudflareStatus().catch((): CloudflareStatusSummary => ({ ...NOMINAL_SUMMARY, activeIncidents: [] }));
    return {
      status: summary.status || "operational",
      activeIncidents: (Array.isArray(summary.activeIncidents) ? summary.activeIncidents : []).map((inc) => ({
        id: inc.id,
        name: inc.name,
        status: inc.status,
        impact: inc.impact,
        components: ["upstream_cloudflare"],
      })),
      coreImpact: deriveCoreImpact(summary),
      raw: summary,
    };
  },
);
