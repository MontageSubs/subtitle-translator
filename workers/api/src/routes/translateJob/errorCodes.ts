import { UpstreamProviderError } from "../../translation/errors";
import { errorMessage } from "../../logging/log";

type ErrorKind = "5xx" | "rate_limit" | "auth" | "timeout" | "malformed";

const PROVIDER_ERROR_CODES: Record<string, Record<ErrorKind, number>> = {
  "google-nmt-pa": { "5xx": 3001, rate_limit: 3002, timeout: 3003, malformed: 3004, auth: 3002 },
  "google-nmt-v2": { "5xx": 3101, rate_limit: 3102, timeout: 3103, malformed: 3104, auth: 3102 },
  "microsoft-nmt-edge": { "5xx": 4001, rate_limit: 4002, timeout: 4003, malformed: 4004, auth: 4003 },
  deepl: { "5xx": 5001, rate_limit: 5002, auth: 5003, timeout: 5004, malformed: 5004 },
};

export const SELF_ERROR_CODE = {
  D1: 2002,
  TURSO: 2004,
  SUBREQUEST_LIMIT: 2006,
  NETWORK: 2008,
  UNKNOWN: 1001,
} as const;

export const MALFORMED_REQUEST_CODE = 1004;
const PROVIDER_CODE_RANGE = [3000, 6000] as const;

const providerCode = (providerId: string, kind: ErrorKind): number => PROVIDER_ERROR_CODES[providerId]?.[kind] ?? SELF_ERROR_CODE.UNKNOWN;

export const isProviderErrorCode = (code: number): boolean => code >= PROVIDER_CODE_RANGE[0] && code < PROVIDER_CODE_RANGE[1];

function upstreamKind({ reason, status }: UpstreamProviderError): ErrorKind {
  if (reason.includes("rate_limited") || reason.includes("quota")) return "rate_limit";
  if (reason.includes("auth") || reason.includes("access_denied") || reason.includes("forbidden")) return "auth";
  return reason.includes("service_unavailable") || status >= 500 ? "5xx" : "malformed";
}

export function classifyPipelineError(error: unknown, provider: string): number {
  const providerId = provider.toLowerCase();
  if (error instanceof UpstreamProviderError) return providerCode(error.provider || providerId, upstreamKind(error));

  const message = errorMessage(error).toLowerCase();
  if ((error instanceof Error && error.name === "AbortError") || message.includes("timeout") || message.includes("aborted")) {
    return providerCode(providerId, "timeout");
  }
  if (message.includes("unexpected") && (message.includes("shape") || message.includes("response"))) return providerCode(providerId, "malformed");
  if (message.includes("initialization")) return providerCode(providerId, "auth");
  if (message.includes("too many subrequests")) return SELF_ERROR_CODE.SUBREQUEST_LIMIT;
  if (message.includes("d1") || message.includes("sqlite")) return SELF_ERROR_CODE.D1;
  if (message.includes("turso") || message.includes("libsql")) return SELF_ERROR_CODE.TURSO;
  if (message.includes("network") || message.includes("fetch failed") || message.includes("econnreset")) return SELF_ERROR_CODE.NETWORK;
  return SELF_ERROR_CODE.UNKNOWN;
}
