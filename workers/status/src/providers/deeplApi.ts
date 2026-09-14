import { StatusProvider, ProviderReport, ProviderIncident } from "./shared/types";
import { pollDeepLStatus } from "../upstream";
import { ComponentStatus } from "../types";

export const deeplApiProvider: StatusProvider = {
  id: "deepl_api",
  name: "DeepL API",
  group: "translation_engines",
  referenceUrl: "https://status.deepl.com/",
  execute: async (env, context): Promise<ProviderReport> => {
    let status: ComponentStatus = await pollDeepLStatus().catch(
      () => "operational",
    );

    const deeplQuotaError =
      (context.windowMetrics.errorsByCode.get(5002) || 0) +
      (context.windowMetrics.errorsByCode.get(5003) || 0);

    if (status === "operational" && deeplQuotaError > 0) {
      console.error(
        JSON.stringify({
          event: "deepl_credentials_issue",
          detail: "DeepL quota exceeded or auth failed. Please update token.",
        }),
      );
      status = "degraded_performance";
    }

    const activeIncidents: ProviderIncident[] = [];
    if (status !== "operational") {
      activeIncidents.push({
        id: "inc_deepl_api_disruption",
        name: "DeepL API Service Disruption",
        status: "investigating",
        impact: status === "major_outage" ? "major" : "minor",
        components: ["deepl_api"],
      });
    }

    return {
      id: "deepl_api",
      name: "DeepL API",
      group: "translation_engines",
      status: status || "operational",
      referenceUrl: "https://status.deepl.com/",
      activeIncidents,
      raw: { quotaErrors: deeplQuotaError },
    };
  },
};
