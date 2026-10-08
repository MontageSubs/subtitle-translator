export class UpstreamProviderError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    readonly provider: string,
    message?: string
  ) {
    super(message || `Upstream Provider Error (${provider}): ${reason} (HTTP ${status})`);
    this.name = "UpstreamProviderError";
  }
}

function reasonFor(status: number, lowerText: string): string {
  if (lowerText.includes("quota") || lowerText.includes("limit") || status === 429) return "quota_exceeded_or_rate_limited";
  if (lowerText.includes("api_key_invalid") || lowerText.includes("key not valid") || status === 401) return "authentication_failed";
  if (status === 403) return "access_denied_or_forbidden";
  if (status >= 500) return "service_unavailable";
  return status === 400 ? "bad_request" : `unexpected_status_${status}`;
}

export const parseUpstreamError = (status: number, text: string, provider: string): UpstreamProviderError =>
  new UpstreamProviderError(status, reasonFor(status, text.toLowerCase()), provider);
