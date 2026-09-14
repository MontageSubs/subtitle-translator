import { StatusProvider, ProviderReport, ProviderIncident } from "./shared/types";
import { probeMicrosoftEdge } from "../probe";
import { ComponentStatus } from "../types";

export const microsoftTranslatorProvider: StatusProvider = {
  id: "microsoft_translator",
  name: "Microsoft Azure Translator",
  group: "translation_engines",
  referenceUrl: "https://status.azure.com/status",
  execute: async (): Promise<ProviderReport> => {
    const result = await probeMicrosoftEdge().catch(() => ({
      componentId: "microsoft_translator_edge",
      success: false,
      httpStatus: 0,
      latencyMs: 0,
      errorType: "network_error" as const,
    }));

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

    const activeIncidents: ProviderIncident[] = [];
    if (status !== "operational") {
      activeIncidents.push({
        id: "inc_microsoft_translator_disruption",
        name: "Microsoft Azure Translator Service Disruption",
        status: "investigating",
        impact: status === "major_outage" ? "major" : "minor",
        components: ["microsoft_translator"],
      });
    }

    return {
      id: "microsoft_translator",
      name: "Microsoft Azure Translator",
      group: "translation_engines",
      status,
      referenceUrl: "https://status.azure.com/status",
      activeIncidents,
      raw: result,
    };
  },
};
