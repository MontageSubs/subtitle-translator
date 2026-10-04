import { defineProvider } from "./shared/utils";
import { toProviderIncidents } from "./shared/googleCloud";
import { pollAzureStatus } from "../monitoring/upstream/azure";

export const azureInfraProvider = defineProvider(
  {
    id: "upstream_azure",
    name: "Microsoft Azure Global Infrastructure",
    group: "infrastructure_dependencies",
    referenceUrl: "https://status.azure.com/status",
  },
  async () => {
    const summary = await pollAzureStatus().catch(() => ({
      translatorStatus: "operational" as const,
      infraStatus: "operational" as const,
      activeIncidents: [],
    }));
    return {
      status: summary.infraStatus || "operational",
      activeIncidents: toProviderIncidents(summary.activeIncidents, "upstream_azure"),
      raw: summary,
    };
  },
);
