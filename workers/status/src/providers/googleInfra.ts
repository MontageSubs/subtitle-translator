import { ProviderPlugin } from "./index";
import {
  pollGoogleCloudIncidents,
  GoogleCloudIncidentsSummary,
} from "../upstream";

export const googleInfraPlugin: ProviderPlugin = {
  id: "upstream_google",
  name: "Google Cloud Global Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://status.cloud.google.com/",
  preFetch: async (env, shared) => {
    if (!shared.has("googleCloudStatus")) {
      shared.set(
        "googleCloudStatus",
        await pollGoogleCloudIncidents().catch(() => null),
      );
    }
  },
  check: async (env, shared) => shared.get("googleCloudStatus"),
  evaluate: (result: GoogleCloudIncidentsSummary) =>
    result?.infraStatus || "operational",
};
