import {
  StatusProvider,
  ProviderReport,
  ProviderIncident,
} from "./shared/types";
import { getSharedGoogleCloudStatus } from "./shared/googleCloud";

export const googleInfraProvider: StatusProvider = {
  id: "upstream_google",
  name: "Google Cloud Global Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://status.cloud.google.com/",
  execute: async (env, context): Promise<ProviderReport> => {
    const summary = await getSharedGoogleCloudStatus(context.sharedState);
    const rawIncidents = Array.isArray(summary.activeIncidents) ? summary.activeIncidents : [];
    const activeIncidents: ProviderIncident[] = rawIncidents.map((inc) => ({
      id: inc.id,
      name: inc.title,
      impact: inc.severity,
      components: ["upstream_google"],
    }));

    return {
      id: "upstream_google",
      name: "Google Cloud Global Infrastructure",
      group: "infrastructure_dependencies",
      status: summary.infraStatus || summary.translationApiStatus || "operational",
      referenceUrl: "https://status.cloud.google.com/",
      activeIncidents,
      raw: summary,
    };
  },
};
