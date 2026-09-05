import { ProviderPlugin } from "./index";
import {
  pollGoogleCloudIncidents,
  GoogleCloudIncidentsSummary,
} from "../upstream";

export const googleV2Plugin: ProviderPlugin = {
  id: "google_v2",
  name: "Google Cloud Translation (v2 API)",
  group: "translation_engines",
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
    result?.translationApiStatus || "operational",
};
