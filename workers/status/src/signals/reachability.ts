import { deriveServiceDomain } from "../config";
import { isRedirectStatus } from "../monitoring/probeRunner";
import { ComponentStatus, ProbePair, ProbeResult, WebAppProbes } from "../types";

export type ReachabilityTarget = "core_infrastructure" | "service_availability";

export interface ReachabilitySignal {
  subject: string;
  target: ReachabilityTarget;
  status: ComponentStatus;
  reason?: string;
}

export interface ReachabilityInputs {
  mainSiteUrl: string;
  statusUrl: string;
  webAppProbes: WebAppProbes;
  statusSiteProbes: ProbePair;
}

export const WEB_APP_SUBJECT = "Web App Frontend";
export const SERVICE_DOMAIN_SUBJECT = "Service Domain";

const describeWebAppFailure = (probe: ProbeResult): string => {
  if (probe.errorType === "unexpected_redirect") return "no longer serves the web app and redirects elsewhere";
  if (probe.errorType === "content_mismatch") return "no longer serves the expected web app content";
  return "is unreachable";
};

function assessWebApp({ mainSiteUrl, webAppProbes }: ReachabilityInputs): ReachabilitySignal {
  const { primary, fallback, redirectTarget } = webAppProbes;
  const signal = { subject: WEB_APP_SUBJECT, target: "core_infrastructure" as const };
  if (primary.success) return { ...signal, status: "operational" };

  const problem = `The web app domain ${new URL(mainSiteUrl).hostname} ${describeWebAppFailure(primary)}`;
  if (redirectTarget?.probe.success) {
    return {
      ...signal,
      status: "degraded_performance",
      reason: `${problem}; GitHub Pages now redirects to ${new URL(redirectTarget.url).hostname}, which is serving the app`,
    };
  }
  if (fallback?.success && !isRedirectStatus(fallback.httpStatus)) {
    return { ...signal, status: "degraded_performance", reason: `${problem}; the GitHub Pages fallback is serving the app` };
  }

  const fallbackNote = !fallback?.success
    ? "the GitHub Pages fallback is also unavailable"
    : redirectTarget
      ? `the GitHub Pages fallback redirects to ${new URL(redirectTarget.url).hostname}, which is not serving the app`
      : "the GitHub Pages fallback only redirects back to it";
  return { ...signal, status: "major_outage", reason: `${problem}, and ${fallbackNote}` };
}

function assessServiceDomain({ statusUrl, statusSiteProbes }: ReachabilityInputs): ReachabilitySignal {
  const { primary, fallback } = statusSiteProbes;
  const signal = { subject: SERVICE_DOMAIN_SUBJECT, target: "service_availability" as const };
  const fallbackServing = Boolean(fallback?.success) && !isRedirectStatus(fallback?.httpStatus ?? 0);
  if (primary.success || !fallbackServing) return { ...signal, status: "operational" };

  const domain = deriveServiceDomain(statusUrl);
  const cause = primary.errorType === "unexpected_redirect" ? "redirects away from the expected content" : "is unreachable";
  return {
    ...signal,
    status: "major_outage",
    reason: `The service domain ${domain} ${cause} while the Pages fallback is healthy, so API requests to ${domain} cannot be served`,
  };
}

export const assessReachability = (inputs: ReachabilityInputs): ReachabilitySignal[] => [
  assessWebApp(inputs),
  assessServiceDomain(inputs),
];
