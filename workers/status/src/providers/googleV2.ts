import {
  StatusProvider,
  ProviderReport,
  ProviderIncident,
} from "./shared/types";
import { getSharedGoogleCloudStatus } from "./shared/googleCloud";

export const googleV2Provider: StatusProvider = {
  id: "google_v2",
  name: "Google Cloud Translation (v2 API)",
  group: "translation_engines",
  referenceUrl: "https://status.cloud.google.com/",
  execute: async (env, context): Promise<ProviderReport> => {
    const summary = await getSharedGoogleCloudStatus(context.sharedState);
    const rawIncidents = Array.isArray(summary.activeIncidents) ? summary.activeIncidents : [];
    const activeIncidents: ProviderIncident[] = rawIncidents.map((inc) => ({
      id: inc.id,
      name: inc.title,
      impact: inc.severity,
      components: ["google_v2"],
    }));

    return {
      id: "google_v2",
      name: "Google Cloud Translation (v2 API)",
      group: "translation_engines",
      status: summary.translationApiStatus || "operational",
      referenceUrl: "https://status.cloud.google.com/",
      activeIncidents,
      raw: summary,
    };
  },
};
