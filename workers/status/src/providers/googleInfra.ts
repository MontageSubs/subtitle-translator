import { defineProvider } from "./shared/utils";
import { getSharedGoogleCloudStatus, toProviderIncidents } from "./shared/googleCloud";

export const googleInfraProvider = defineProvider(
  {
    id: "upstream_google",
    name: "Google Cloud Global Infrastructure",
    group: "infrastructure_dependencies",
    referenceUrl: "https://status.cloud.google.com/",
  },
  async (_env, context) => {
    const summary = await getSharedGoogleCloudStatus(context.sharedState);
    return {
      status: summary.infraStatus || summary.translationApiStatus || "operational",
      activeIncidents: toProviderIncidents(summary.activeIncidents, "upstream_google"),
      raw: summary,
    };
  },
);
