import { ProviderPlugin } from "./index";
import { pollDeepLStatus } from "../upstream";
import { ComponentStatus } from "../types";

export const deeplApiPlugin: ProviderPlugin = {
  id: "deepl_api",
  name: "DeepL API",
  group: "translation_engines",
  referenceUrl: "https://status.deepl.com/",
  check: async () => pollDeepLStatus().catch(() => "operational"),
  evaluate: (status: ComponentStatus, ctx) => {
    const deeplQuotaError =
      (ctx.windowMetrics.errorsByCode.get(5002) || 0) +
      (ctx.windowMetrics.errorsByCode.get(5003) || 0);
    if (status === "operational" && deeplQuotaError > 0) {
      console.error(
        JSON.stringify({
          event: "deepl_credentials_issue",
          detail: "DeepL quota exceeded or auth failed. Please update token.",
        }),
      );
      return "operational";
    }
    return status || "operational";
  },
};
