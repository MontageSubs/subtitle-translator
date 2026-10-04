import { defineProvider } from "./shared/utils";
import { probeGooglePA } from "../monitoring/probe";
import { ComponentStatus, ProbeErrorType } from "../types";

const DEGRADED_ERROR_TYPES: ProbeErrorType[] = ["auth_error", "rate_limited", "schema_error"];

export const googlePaProvider = defineProvider(
  {
    id: "google_pa",
    name: "Google Cloud Translation (PA Engine)",
    group: "translation_engines",
    referenceUrl: "https://status.cloud.google.com/",
  },
  async (env) => {
    const result = await probeGooglePA(env.DB).catch(() => ({
      componentId: "google_translate_public",
      success: false,
      httpStatus: 0,
      latencyMs: 0,
      errorType: "network_error" as const,
    }));

    let status: ComponentStatus = "operational";
    if (!result?.success) {
      status = result?.errorType && DEGRADED_ERROR_TYPES.includes(result.errorType) ? "degraded_performance" : "major_outage";
    }
    return { status, raw: result };
  },
);
