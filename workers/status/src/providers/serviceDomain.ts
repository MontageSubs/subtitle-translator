import { deriveServiceDomain } from "../config";
import { isRedirectStatus } from "../monitoring/probeRunner";
import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact } from "./shared/types";

const NO_CORE_IMPACT: ProviderCoreImpact = { affected: false, status: "operational" };

export const serviceDomainProvider = defineProvider(
  {
    id: "service_domain",
    name: "Service Domain",
    group: "core_services",
  },
  async (_env, context) => {
    const { primary, fallback } = context.statusSiteProbes;
    const raw = { primary, fallback };

    if (primary.success) return { status: "operational", coreImpact: NO_CORE_IMPACT, raw };

    const fallbackServing = Boolean(fallback?.success) && !isRedirectStatus(fallback?.httpStatus ?? 0);
    if (!fallbackServing) return { status: "operational", coreImpact: NO_CORE_IMPACT, raw };

    const domain = deriveServiceDomain(context.statusUrl);
    const cause = primary.errorType === "unexpected_redirect" ? "redirects away from the expected content" : "is unreachable";
    return {
      status: "major_outage",
      coreImpact: {
        affected: true,
        status: "major_outage",
        reason: `The service domain ${domain} ${cause} while the Pages fallback is healthy, so API requests to ${domain} cannot be served`,
      },
      raw,
    };
  },
);
