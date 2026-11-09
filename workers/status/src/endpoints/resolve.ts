import { SiteConfig } from "../config";
import { isRedirectStatus } from "../monitoring/probeRunner";
import { EndpointSource, ProbePair, ProbeResult, ReportedServiceEndpoints, ServiceEndpoint, ServiceEndpointId, WebAppProbes } from "../types";

const ENDPOINT_ORDER: Readonly<Record<ServiceEndpointId, number>> = { status_site: 0, relay: 1, web_app: 2, models_site: 3, assets_site: 4 };

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

export const orderEndpoints = (endpoints: readonly ServiceEndpoint[]): ServiceEndpoint[] =>
  [...endpoints].sort((left, right) => ENDPOINT_ORDER[left.id] - ENDPOINT_ORDER[right.id]);

export function resolveRelayEndpoint(reported: ReportedServiceEndpoints | null): ServiceEndpoint | null {
  if (!reported) return null;
  return {
    id: "relay",
    primaryUrl: reported.primary,
    fallbackUrl: reported.fallback || null,
    recommendedUrl: reported.primary,
    recommendedSource: "primary",
  };
}

function staticEndpoint(id: ServiceEndpointId, primaryUrl: string, fallbackUrl: string): ServiceEndpoint[] {
  return primaryUrl ? [{ id, primaryUrl, fallbackUrl: fallbackUrl || null, recommendedUrl: primaryUrl, recommendedSource: "primary" }] : [];
}

export function resolveEndpoints(site: SiteConfig, webApp: WebAppProbes, statusSite: ProbePair): ServiceEndpoint[] {
  return [
    ...staticEndpoint("models_site", site.modelsUrl, site.modelsFallbackUrl),
    ...staticEndpoint("assets_site", site.assetsUrl, site.assetsFallbackUrl),
    buildEndpoint("web_app", site.mainSiteUrl, site.fallbackSiteUrl, webApp.primary, [
      { source: "redirect_target", url: webApp.redirectTarget?.url ?? "", serving: isServing(webApp.redirectTarget?.probe) },
      { source: "fallback", url: site.fallbackSiteUrl, serving: isServing(webApp.fallback) },
    ]),
    buildEndpoint("status_site", site.statusUrl, site.statusFallbackUrl, statusSite.primary, [
      { source: "fallback", url: site.statusFallbackUrl, serving: isServing(statusSite.fallback) },
    ]),
  ];
}
