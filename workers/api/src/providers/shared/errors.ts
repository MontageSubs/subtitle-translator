export function parseUpstreamError(status: number, text: string, provider: string): Error {
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

    return new Error(`Upstream Provider Error (${provider}): ${reason}`);
}
