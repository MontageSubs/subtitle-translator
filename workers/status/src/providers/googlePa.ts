import { StatusProvider, ProviderReport } from "./shared/types";
import { probeGooglePA } from "../probe";
import { ComponentStatus } from "../types";

export const googlePaProvider: StatusProvider = {
  id: "google_pa",
  name: "Google Cloud Translation (PA Engine)",
  group: "translation_engines",
  referenceUrl: "https://status.cloud.google.com/",
  execute: async (env): Promise<ProviderReport> => {
    const result = await probeGooglePA(env.DB).catch(() => ({
      componentId: "google_translate_public",
      success: false,
      httpStatus: 0,
      latencyMs: 0,
      errorType: "network_error" as const,
    }));

    let status: ComponentStatus = "operational";
    if (!result?.success) {
      if (
        result?.errorType === "auth_error" ||
        result?.errorType === "rate_limited" ||
        result?.errorType === "schema_error"
      ) {
        status = "degraded_performance";
      } else {
        status = "major_outage";
      }
    }

    return {
      id: "google_pa",
      name: "Google Cloud Translation (PA Engine)",
      group: "translation_engines",
      status,
      raw: result,
    };
  },
};
