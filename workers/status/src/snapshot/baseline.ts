import { SystemStatusSnapshot } from "../types";
import { COMPONENT_DEFINITIONS, STATUS_PAGE_VERSION } from "../arbitration/components";

export function createBaselineSnapshot(statusUrl: string, retentionDays = 90): SystemStatusSnapshot {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      apiVersion: "v1",
      version: STATUS_PAGE_VERSION,
      environment: "production",
      retentionDays,
      badgeUrl: `${statusUrl}/badge.svg`,
    },
    summary: {
      overallStatus: "operational",
      rolling90dRatio: 100,
      rollingDays: retentionDays,
      activeIncidentsCount: 0,
      past24hAvailability: 100,
    },
    components: COMPONENT_DEFINITIONS.map(({ id, name, group }) => ({
      id,
      name,
      group,
      status: "operational",
      uptime90d: 100,
      history90d: [],
    })),
    incidents: [],
    externalReferences: [],
  };
}
