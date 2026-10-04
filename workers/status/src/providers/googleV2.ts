import { defineProvider } from "./shared/utils";
import { getSharedGoogleCloudStatus, toProviderIncidents } from "./shared/googleCloud";

export const googleV2Provider = defineProvider(
  {
    id: "google_v2",
    name: "Google Cloud Translation (v2 API)",
    group: "translation_engines",
    referenceUrl: "https://status.cloud.google.com/",
  },
  async (_env, context) => {
    const summary = await getSharedGoogleCloudStatus(context.sharedState);
    return {
      status: summary.translationApiStatus || "operational",
      activeIncidents: toProviderIncidents(summary.activeIncidents, "google_v2"),
      raw: summary,
    };
  },
);
