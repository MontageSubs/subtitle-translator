import { ProviderPlugin } from "./index";
import { pollCloudflareStatus } from "../upstream";
import { ComponentStatus } from "../types";

export const cloudflarePlugin: ProviderPlugin = {
  id: "upstream_cloudflare",
  name: "Cloudflare Edge Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://www.cloudflarestatus.com/",
  check: async () => pollCloudflareStatus().catch(() => "operational"),
  evaluate: (status: ComponentStatus) => status || "operational",
};
