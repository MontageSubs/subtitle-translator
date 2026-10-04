import { defineProvider } from "./shared/utils";
import { pollDeepLStatus } from "../monitoring/upstream/deepl";
import { ComponentStatus } from "../types";

const QUOTA_ERROR_CODES = [5002, 5003];

export const deeplApiProvider = defineProvider(
  {
    id: "deepl_api",
    name: "DeepL API",
    group: "translation_engines",
    referenceUrl: "https://status.deepl.com/",
  },
  async (_env, context) => {
    let status: ComponentStatus = await pollDeepLStatus().catch(() => "operational");

    const quotaErrors = QUOTA_ERROR_CODES.reduce((sum, code) => sum + (context.windowMetrics.errorsByCode.get(code) || 0), 0);
    if (status === "operational" && quotaErrors > 0) {
      console.error(
        JSON.stringify({
          event: "deepl_credentials_issue",
          detail: "DeepL quota exceeded or auth failed. Please update token.",
        }),
      );
      status = "degraded_performance";
    }

    return {
      status: status || "operational",
      activeIncidents:
        status === "operational"
          ? []
          : [
              {
                name: "DeepL API Service Disruption",
                status: "investigating",
                impact: status === "major_outage" ? "major" : "minor",
                components: ["deepl_api"],
              },
            ],
      raw: { quotaErrors },
    };
  },
);
