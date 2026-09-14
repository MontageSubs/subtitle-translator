import {
  StatusProvider,
  ProviderReport,
  ProviderIncident,
  ProviderCoreImpact,
} from "./shared/types";
import { pollTursoStatus } from "../upstream";
import { ComponentStatus } from "../types";

export const tursoProvider: StatusProvider = {
  id: "upstream_storage",
  name: "Database & Storage Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://status.turso.tech",
  execute: async (env, context): Promise<ProviderReport> => {
    const platformStatus: ComponentStatus = await pollTursoStatus().catch(
      () => "operational",
    );

    let blockingErrors = 0;
    let nonBlockingErrors = 0;
    for (const [code, count] of context.windowMetrics.errorsByCode.entries()) {
      if (code === 2001 || code === 2002) blockingErrors += count;
      if (code === 2003 || code === 2004) nonBlockingErrors += count;
    }

    let status: ComponentStatus = "operational";
    let coreImpact: ProviderCoreImpact = {
      affected: false,
      status: "operational",
    };
    const activeIncidents: ProviderIncident[] = [];

    if (blockingErrors > 0 || platformStatus === "major_outage") {
      status = "major_outage";
      coreImpact = {
        affected: true,
        status: "major_outage",
        reason: "Database storage outage",
      };
      activeIncidents.push({
        id: "inc_turso_storage_outage",
        name: "Database Storage Connectivity Outage",
        status: "investigating",
        impact: "major",
        components: ["upstream_storage"],
      });
    } else if (
      nonBlockingErrors > 0 ||
      platformStatus === "degraded_performance" ||
      platformStatus === "partial_outage"
    ) {
      status = "degraded_performance";
      activeIncidents.push({
        id: "inc_turso_storage_degraded",
        name: "Database & Storage Performance Degradation",
        status: "monitoring",
        impact: "minor",
        components: ["upstream_storage"],
      });
    }

    return {
      id: "upstream_storage",
      name: "Database & Storage Infrastructure",
      group: "infrastructure_dependencies",
      status,
      referenceUrl: "https://status.turso.tech",
      activeIncidents,
      coreImpact,
      raw: { platformStatus, blockingErrors, nonBlockingErrors },
    };
  },
};
