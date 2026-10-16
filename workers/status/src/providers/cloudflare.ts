import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact, ProviderExecutionContext } from "./shared/types";
import { pollCloudflareStatus, CloudflareStatusSummary } from "../monitoring/upstream/cloudflare";
import { countErrors } from "../signals/errorCodes";
import { MIN_CORROBORATING_FAILURES } from "../signals/failureRate";

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

const NO_CORE_IMPACT: ProviderCoreImpact = { affected: false, status: "operational" };

function deriveCoreImpact(summary: CloudflareStatusSummary, context: ProviderExecutionContext): ProviderCoreImpact {
  if (summary.workersStatus === "operational") return NO_CORE_IMPACT;
  if (countErrors(context.windowMetrics, "gateway") < MIN_CORROBORATING_FAILURES) return NO_CORE_IMPACT;
  const isMajor = summary.workersStatus === "major_outage";
  return {
    affected: true,
    status: isMajor ? "major_outage" : "degraded_performance",
    reason: `Cloudflare Workers edge ${isMajor ? "outage" : "degradation"} confirmed by gateway errors`,
  };
}

export const cloudflareProvider = defineProvider(
  {
    id: "upstream_cloudflare",
    name: "Cloudflare Edge Infrastructure",
    group: "infrastructure_dependencies",
    referenceUrl: "https://www.cloudflarestatus.com/",
  },
  async (_env, context) => {
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
      coreImpact: deriveCoreImpact(summary, context),
      raw: summary,
    };
  },
);
