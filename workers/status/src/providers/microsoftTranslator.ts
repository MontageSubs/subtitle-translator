import { defineProvider } from "./shared/utils";
import { probeMicrosoftEdge } from "../monitoring/probe";
import { ComponentStatus, ProbeErrorType } from "../types";

const DEGRADED_ERROR_TYPES: ProbeErrorType[] = ["rate_limited", "timeout"];

export const microsoftTranslatorProvider = defineProvider(
  {
    id: "microsoft_translator",
    name: "Microsoft Azure Translator",
    group: "translation_engines",
    referenceUrl: "https://status.azure.com/status",
  },
  async () => {
    const result = await probeMicrosoftEdge().catch(() => ({
      componentId: "microsoft_translator_edge",
      success: false,
      httpStatus: 0,
      latencyMs: 0,
      errorType: "network_error" as const,
    }));

    let status: ComponentStatus = "operational";
    if (!result?.success) {
      status = result?.errorType && DEGRADED_ERROR_TYPES.includes(result.errorType) ? "degraded_performance" : "major_outage";
    }

    return {
      status,
      activeIncidents:
        status === "operational"
          ? []
          : [
              {
                name: "Microsoft Azure Translator Service Disruption",
                status: "investigating",
                impact: status === "major_outage" ? "major" : "minor",
                components: ["microsoft_translator"],
              },
            ],
      raw: result,
    };
  },
);
