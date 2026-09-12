import { ProviderPlugin } from "./index";
import { probeMicrosoftEdge } from "../probe";
import { ProbeResult, ComponentStatus } from "../types";

export const microsoftTranslatorPlugin: ProviderPlugin = {
  id: "microsoft_translator",
  name: "Microsoft Azure Translator",
  group: "translation_engines",
  referenceUrl: "https://status.azure.com/status",
  check: async () => probeMicrosoftEdge(),
  evaluate: (result: ProbeResult) => {
    let status: ComponentStatus = "operational";
    if (!result?.success) {
      if (
        result?.errorType === "rate_limited" ||
        result?.errorType === "timeout"
      ) {
        status = "degraded_performance";
      } else {
        status = "major_outage";
      }
    }
    return status;
  },
};
