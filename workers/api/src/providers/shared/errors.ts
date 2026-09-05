export class UpstreamProviderError extends Error {
    public status: number;
    public reason: string;
    public provider: string;

    constructor(status: number, reason: string, provider: string, message?: string) {
        super(message || `Upstream Provider Error (${provider}): ${reason} (HTTP ${status})`);
        this.name = "UpstreamProviderError";
        this.status = status;
        this.reason = reason;
        this.provider = provider;
        Object.setPrototypeOf(this, UpstreamProviderError.prototype);
    }
}

export function parseUpstreamError(status: number, text: string, provider: string): UpstreamProviderError {
    let reason = "unknown";
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes("quota") || lowerText.includes("limit") || status === 429) {
        reason = "quota_exceeded_or_rate_limited";
    } else if (lowerText.includes("api_key_invalid") || lowerText.includes("key not valid") || status === 401) {
        reason = "authentication_failed";
    } else if (status === 403) {
        reason = "access_denied_or_forbidden";
    } else if (status >= 500) {
        reason = "service_unavailable";
    } else if (status === 400) {
        reason = "bad_request";
    } else {
        reason = `unexpected_status_${status}`;
    }

    return new UpstreamProviderError(status, reason, provider);
}
