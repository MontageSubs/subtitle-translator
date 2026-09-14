import {
  StatusProvider,
  ProviderReport,
  ProviderIncident,
} from "./shared/types";
import { pollAzureStatus, AzureStatusSummary } from "../upstream";
import { ComponentStatus } from "../types";

export const azureInfraProvider: StatusProvider = {
  id: "upstream_azure",
  name: "Microsoft Azure Global Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://status.azure.com/status",
  execute: async (): Promise<ProviderReport> => {
    const summary: AzureStatusSummary = await pollAzureStatus().catch(() => ({
      translatorStatus: "operational" as ComponentStatus,
      infraStatus: "operational" as ComponentStatus,
      activeIncidents: [],
    }));

    const rawIncidents = Array.isArray(summary.activeIncidents)
      ? summary.activeIncidents
      : [];
    const activeIncidents: ProviderIncident[] = rawIncidents.map((inc) => ({
      id: inc.id,
      name: inc.title,
      impact: inc.severity,
      components: ["upstream_azure"],
    }));

    return {
      id: "upstream_azure",
      name: "Microsoft Azure Global Infrastructure",
      group: "infrastructure_dependencies",
      status: summary.infraStatus || "operational",
      referenceUrl: "https://status.azure.com/status",
      activeIncidents,
      raw: summary,
    };
  },
};
