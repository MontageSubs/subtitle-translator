import { ProviderPlugin } from "./index";
import { probeGooglePA } from "../probe";
import { ProbeResult, ComponentStatus } from "../types";

export const googlePaPlugin: ProviderPlugin = {
  id: "google_pa",
  name: "Google Cloud Translation (PA Engine)",
  group: "translation_engines",
  check: async (env) => probeGooglePA(env.DB),
  evaluate: (result: ProbeResult, ctx) => {
    let status: ComponentStatus = "operational";
    if (!result?.success) {
      if (
        result?.errorType === "auth_error" ||
        result?.errorType === "rate_limited" ||
        result?.errorType === "schema_error" ||
        result?.detail === "auth_error" ||
        result?.detail === "rate_limited"
      ) {
        status = "degraded_performance";
      } else {
        status = "major_outage";
      }
    }
    const v2Status =
      ctx.sharedState.get("googleCloudStatus")?.translationApiStatus;
    if (v2Status === "major_outage") {
      status = "major_outage";
    } else if (
      (v2Status === "degraded_performance" || v2Status === "partial_outage") &&
      status === "operational"
    ) {
      status = "degraded_performance";
    }
    return status;
  },
};
