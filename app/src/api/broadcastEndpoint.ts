const ENDPOINT_IDS = ["status_site", "service", "web_app", "models_site", "assets_site"] as const;
const ENDPOINT_SOURCES = ["primary", "fallback", "redirect_target"] as const;

export type BroadcastEndpointId = (typeof ENDPOINT_IDS)[number];

export type BroadcastEndpointSource = (typeof ENDPOINT_SOURCES)[number];

export interface BroadcastEndpoint {
  id: BroadcastEndpointId;
  primaryUrl: string;
  fallbackUrl: string | null;
  recommendedSource: BroadcastEndpointSource;
  redirectTargetUrl?: string;
}

export const isBroadcastEndpoint = (value: any): value is BroadcastEndpoint =>
  (ENDPOINT_IDS as readonly string[]).includes(value?.id) &&
  (ENDPOINT_SOURCES as readonly string[]).includes(value.recommendedSource) &&
  typeof value.primaryUrl === "string" &&
  (value.recommendedSource !== "fallback" || typeof value.fallbackUrl === "string") &&
  (value.recommendedSource !== "redirect_target" || typeof value.redirectTargetUrl === "string");

export function recommendedUrlOf({ recommendedSource, primaryUrl, fallbackUrl, redirectTargetUrl }: BroadcastEndpoint): string {
  if (recommendedSource === "fallback") return fallbackUrl ?? primaryUrl;
  if (recommendedSource === "redirect_target") return redirectTargetUrl ?? primaryUrl;
  return primaryUrl;
}
