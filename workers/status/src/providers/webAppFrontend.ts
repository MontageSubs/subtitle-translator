import { isRedirectStatus } from "../monitoring/probeRunner";
import { ProbeResult } from "../types";
import { defineProvider } from "./shared/utils";
import { ProviderCoreImpact } from "./shared/types";

const NO_CORE_IMPACT: ProviderCoreImpact = { affected: false, status: "operational" };

const describePrimaryFailure = (probe: ProbeResult): string => {
  if (probe.errorType === "unexpected_redirect") return "no longer serves the web app and redirects elsewhere";
  if (probe.errorType === "content_mismatch") return "no longer serves the expected web app content";
  return "is unreachable";
};

export const webAppFrontendProvider = defineProvider(
  {
    id: "web_app_frontend",
    name: "Web App Frontend",
    group: "core_services",
  },
  async (_env, context) => {
    const { primary, fallback, redirectTarget } = context.webAppProbes;
    const raw = { primary, fallback, redirectTarget };

    if (primary.success) return { status: "operational", coreImpact: NO_CORE_IMPACT, raw };

    const problem = `The web app domain ${new URL(context.mainSiteUrl).hostname} ${describePrimaryFailure(primary)}`;
    const degraded = (reason: string) => ({
      status: "degraded_performance" as const,
      coreImpact: { affected: true, status: "degraded_performance" as const, reason },
      raw,
    });

    if (redirectTarget?.probe.success) {
      return degraded(`${problem}; GitHub Pages now redirects to ${new URL(redirectTarget.url).hostname}, which is serving the app`);
    }
    if (fallback?.success && !isRedirectStatus(fallback.httpStatus)) {
      return degraded(`${problem}; the GitHub Pages fallback is serving the app`);
    }

    const fallbackNote = !fallback?.success
      ? "the GitHub Pages fallback is also unavailable"
      : redirectTarget
        ? `the GitHub Pages fallback redirects to ${new URL(redirectTarget.url).hostname}, which is not serving the app`
        : "the GitHub Pages fallback only redirects back to it";
    return {
      status: "major_outage",
      coreImpact: { affected: true, status: "major_outage", reason: `${problem}, and ${fallbackNote}` },
      raw,
    };
  },
);
