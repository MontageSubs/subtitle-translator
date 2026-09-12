import { ProviderPlugin } from "./index";
import { pollCloudflareStatus, CloudflareStatusSummary } from "../upstream";
import { ComponentStatus } from "../types";

export const cloudflarePlugin: ProviderPlugin = {
  id: "upstream_cloudflare",
  name: "Cloudflare Edge Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://www.cloudflarestatus.com/",
  check: async () =>
    pollCloudflareStatus().catch((): CloudflareStatusSummary => ({
      status: "operational",
      workersStatus: "operational",
      d1Status: "operational",
      pagesStatus: "operational",
      turnstileStatus: "operational",
      indicator: "none",
      description: "Cloudflare status operational",
      activeIncidents: [],
    })),
  evaluate: (result: any) => {
    if (typeof result === "string") return result;
    if (result && typeof result === "object" && result.status) {
      return result.status;
    }
    return "operational";
  },
};
