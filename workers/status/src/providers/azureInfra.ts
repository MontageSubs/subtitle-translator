import { ProviderPlugin } from "./index";
import { pollAzureStatus, AzureStatusSummary } from "../upstream";
import { ComponentStatus } from "../types";

export const azureInfraPlugin: ProviderPlugin = {
  id: "upstream_azure",
  name: "Microsoft Azure Global Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://status.azure.com/status",
  preFetch: async (env, shared) => {
    if (!shared.has("azureStatus")) {
      shared.set(
        "azureStatus",
        await pollAzureStatus().catch(() => null),
      );
    }
  },
  check: async (env, shared) => shared.get("azureStatus"),
  evaluate: (result: AzureStatusSummary | ComponentStatus) => {
    if (typeof result === "object" && result !== null) {
      return result.infraStatus || "operational";
    }
    return (result as ComponentStatus) || "operational";
  },
};
