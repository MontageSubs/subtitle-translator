import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact, ProviderIncident } from "./shared/types";
import { pollTursoStatus } from "../monitoring/upstream/turso";
import { ComponentStatus } from "../types";
import { countErrors, countServedRequests } from "../signals/errorCodes";
import { assessFailureRate } from "../signals/failureRate";

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

    const blockingErrors = countErrors(context.windowMetrics, "storage_blocking");
    const nonBlockingErrors = countErrors(context.windowMetrics, "storage_degrading");
    const servedRequests = countServedRequests(context.windowMetrics);
    const blockingStatus = assessFailureRate(blockingErrors, servedRequests);
    const nonBlockingStatus = assessFailureRate(nonBlockingErrors, servedRequests);
    const raw = { platformStatus, blockingErrors, nonBlockingErrors, blockingStatus, nonBlockingStatus };

    if (blockingStatus !== "operational") {
      const isMajor = blockingStatus === "major_outage";
      const incident: ProviderIncident = {
        name: isMajor ? "Database Storage Connectivity Outage" : "Database Storage Connectivity Degradation",
        status: "investigating",
        impact: isMajor ? "major" : "minor",
        components: ["upstream_storage"],
      };
      return {
        status: blockingStatus,
        coreImpact: { affected: true, status: blockingStatus, reason: `Database storage ${isMajor ? "outage" : "degradation"}` },
        activeIncidents: [incident],
        raw,
      };
    }

    const status: ComponentStatus =
      platformStatus === "major_outage"
        ? "major_outage"
        : nonBlockingStatus !== "operational" || platformStatus !== "operational"
          ? "degraded_performance"
          : "operational";
    const incident: ProviderIncident = {
      name: status === "major_outage" ? "Database Platform Outage" : "Database & Storage Performance Degradation",
      status: status === "major_outage" ? "investigating" : "monitoring",
      impact: status === "major_outage" ? "major" : "minor",
      components: ["upstream_storage"],
    };
    return {
      status,
      coreImpact: NO_CORE_IMPACT,
      activeIncidents: status === "operational" ? [] : [incident],
      raw,
    };
  },
);
