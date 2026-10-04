import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact, ProviderIncident } from "./shared/types";
import { pollTursoStatus } from "../monitoring/upstream/turso";
import { ComponentStatus } from "../types";

const BLOCKING_ERROR_CODES = [2001, 2002];
const NON_BLOCKING_ERROR_CODES = [2003, 2004];

const NO_CORE_IMPACT: ProviderCoreImpact = { affected: false, status: "operational" };

export const tursoProvider = defineProvider(
  {
    id: "upstream_storage",
    name: "Database & Storage Infrastructure",
    group: "infrastructure_dependencies",
    referenceUrl: "https://status.turso.tech",
  },
  async (_env, context) => {
    const platformStatus: ComponentStatus = await pollTursoStatus().catch(() => "operational");

    let blockingErrors = 0;
    let nonBlockingErrors = 0;
    for (const [code, count] of context.windowMetrics.errorsByCode.entries()) {
      if (BLOCKING_ERROR_CODES.includes(code)) blockingErrors += count;
      if (NON_BLOCKING_ERROR_CODES.includes(code)) nonBlockingErrors += count;
    }

    const raw = { platformStatus, blockingErrors, nonBlockingErrors };

    if (blockingErrors > 0 || platformStatus === "major_outage") {
      const incident: ProviderIncident = {
        name: "Database Storage Connectivity Outage",
        status: "investigating",
        impact: "major",
        components: ["upstream_storage"],
      };
      return {
        status: "major_outage",
        coreImpact: { affected: true, status: "major_outage", reason: "Database storage outage" },
        activeIncidents: [incident],
        raw,
      };
    }

    const isDegraded =
      nonBlockingErrors > 0 || platformStatus === "degraded_performance" || platformStatus === "partial_outage";
    return {
      status: isDegraded ? "degraded_performance" : "operational",
      coreImpact: NO_CORE_IMPACT,
      activeIncidents: isDegraded
        ? [
            {
              name: "Database & Storage Performance Degradation",
              status: "monitoring",
              impact: "minor",
              components: ["upstream_storage"],
            },
          ]
        : [],
      raw,
    };
  },
);
