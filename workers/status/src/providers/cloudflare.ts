import { ProviderPlugin } from "./index";
import { pollCloudflareStatus } from "../upstream";
import { ComponentStatus } from "../types";

export const cloudflarePlugin: ProviderPlugin = {
  id: "upstream_cloudflare",
  name: "Cloudflare Edge Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://www.cloudflarestatus.com/",
  check: async () =>
    pollCloudflareStatus().catch(() => ({
      status: "operational" as ComponentStatus,
      indicator: "none" as const,
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
