import { ProviderPlugin } from "./index";
import { pollAzureStatus, AzureStatusSummary } from "../upstream";
import { probeMicrosoftEdge } from "../probe";
import { ProbeResult, ComponentStatus } from "../types";

export const microsoftTranslatorPlugin: ProviderPlugin = {
  id: "microsoft_translator",
  name: "Microsoft Azure Translator",
  group: "translation_engines",
  referenceUrl: "https://status.azure.com/status",
  preFetch: async (env, shared) => {
    if (!shared.has("azureStatus")) {
      shared.set(
        "azureStatus",
        await pollAzureStatus().catch(() => null),
      );
    }
  },
  check: async () => probeMicrosoftEdge(),
  evaluate: (probeResult: ProbeResult, ctx) => {
    let status: ComponentStatus = "operational";
    if (!probeResult?.success) status = "degraded_performance";

    const azStatus = ctx.sharedState.get("azureStatus") as
      | AzureStatusSummary
      | ComponentStatus
      | undefined;
    const translatorStatus =
      typeof azStatus === "object" && azStatus !== null
        ? azStatus.translatorStatus
        : azStatus;
    if (
      translatorStatus === "major_outage" ||
      translatorStatus === "partial_outage"
    ) {
      status = translatorStatus;
    } else if (
      translatorStatus === "degraded_performance" &&
      status === "operational"
    ) {
      status = "degraded_performance";
    }
    return status;
  },
};
