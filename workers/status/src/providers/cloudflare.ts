import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact, ProviderExecutionContext } from "./shared/types";
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

const GATEWAY_ERROR_MIN = 1000;
const GATEWAY_ERROR_MAX = 2000;

function sumGatewayErrors(context: ProviderExecutionContext): number {
  let count = 0;
  for (const [code, errors] of context.windowMetrics.errorsByCode.entries()) {
    if (code >= GATEWAY_ERROR_MIN && code < GATEWAY_ERROR_MAX) count += errors;
  }
  return count;
}

const MIN_GATEWAY_ERRORS_FOR_CORE_IMPACT = 3;

function deriveCoreImpact(summary: CloudflareStatusSummary, context: ProviderExecutionContext): ProviderCoreImpact {
  if (summary.workersStatus === "major_outage") {
    return { affected: true, status: "major_outage", reason: "Cloudflare Workers edge outage" };
  }
  if (summary.workersStatus === "degraded_performance") {
    return { affected: true, status: "degraded_performance", reason: "Cloudflare Workers edge degradation" };
  }
  const gatewayErrors = sumGatewayErrors(context);
  if (gatewayErrors >= MIN_GATEWAY_ERRORS_FOR_CORE_IMPACT) {
    return { affected: true, status: "degraded_performance", reason: "Edge gateway connectivity errors" };
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
