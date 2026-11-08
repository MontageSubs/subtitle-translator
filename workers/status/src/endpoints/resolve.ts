import { SiteConfig } from "../config";
import { isRedirectStatus } from "../monitoring/probeRunner";
import { EndpointSource, ProbePair, ProbeResult, ServiceEndpoint, ServiceEndpointId, WebAppProbes } from "../types";

const isServing = (probe: ProbeResult | null | undefined): boolean =>
  Boolean(probe?.success) && !isRedirectStatus(probe?.httpStatus ?? 0);

interface EndpointCandidate {
  source: EndpointSource;
  url: string;
  serving: boolean;
}

function buildEndpoint(
  id: ServiceEndpointId,
  primaryUrl: string,
  fallbackUrl: string,
  primary: ProbeResult,
  alternatives: EndpointCandidate[],
): ServiceEndpoint {
  const chosen = primary.success ? undefined : alternatives.find((candidate) => candidate.url && candidate.serving);
  return {
    id,
    primaryUrl,
    fallbackUrl: fallbackUrl || null,
    recommendedUrl: chosen?.url ?? primaryUrl,
    recommendedSource: chosen?.source ?? "primary",
  };
}

export function resolveEndpoints(site: SiteConfig, webApp: WebAppProbes, statusSite: ProbePair): ServiceEndpoint[] {
  return [
    buildEndpoint("web_app", site.mainSiteUrl, site.fallbackSiteUrl, webApp.primary, [
      { source: "redirect_target", url: webApp.redirectTarget?.url ?? "", serving: isServing(webApp.redirectTarget?.probe) },
      { source: "fallback", url: site.fallbackSiteUrl, serving: isServing(webApp.fallback) },
    ]),
    buildEndpoint("status_site", site.statusUrl, site.statusFallbackUrl, statusSite.primary, [
      { source: "fallback", url: site.statusFallbackUrl, serving: isServing(statusSite.fallback) },
    ]),
  ];
}
