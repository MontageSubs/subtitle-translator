export function sanitizeSnippet(text?: string, maxLen = 200): string {
  if (!text) return "";
  const singleLine = text.replace(/[\r\n\t]+/g, " ").trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen)}...`;
}

export function logCycleSummary(
  durationMs: number,
  overallStatus: string,
  activeIncidentsCount: number,
  errors: string[],
): void {
  if (errors.length === 0 && overallStatus === "operational") {
    console.log(
      `[StatusCycle] Completed in ${durationMs}ms | Status: operational | Incidents: ${activeIncidentsCount}`,
    );
    return;
  }

  const errorSummary = errors.length > 0 ? ` | Errors: [${errors.join("; ")}]` : "";
  console.log(
    `[StatusCycle] Completed in ${durationMs}ms | Status: ${overallStatus} | Incidents: ${activeIncidentsCount}${errorSummary}`,
  );
}

export function logProbeFailure(
  probeName: string,
  errorType: string,
  latencyMs: number,
  httpStatus: number,
  detail?: string,
  responseSnippet?: string,
): void {
  const statusStr = httpStatus > 0 ? `HTTP ${httpStatus}` : "No Response";
  const detailStr = detail ? ` | Detail: ${detail}` : "";
  const snippetStr = responseSnippet ? ` | Body: "${sanitizeSnippet(responseSnippet)}"` : "";
  console.error(
    `[Probe Failure] ${probeName} (${errorType}) | ${statusStr} | Latency: ${latencyMs}ms${detailStr}${snippetStr}`,
  );
}

export function logUpstreamPollError(
  serviceName: string,
  url: string,
  httpStatus: number,
  errorDetail: string,
  responseSnippet?: string,
): void {
  const statusStr = httpStatus > 0 ? `HTTP ${httpStatus}` : "Network/Timeout";
  const snippetStr = responseSnippet ? ` | Body: "${sanitizeSnippet(responseSnippet)}"` : "";
  console.error(
    `[Upstream Poll Error] ${serviceName} -> ${url} | ${statusStr} | Reason: ${errorDetail}${snippetStr}`,
  );
}

export function logUpstreamParseError(
  serviceName: string,
  url: string,
  reason: string,
  payloadSnippet?: string,
): void {
  const snippetStr = payloadSnippet ? ` | Payload: "${sanitizeSnippet(payloadSnippet)}"` : "";
  console.error(
    `[Upstream Parse Error] ${serviceName} -> ${url} | Reason: ${reason}${snippetStr}`,
  );
}

export function logSystemError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[System Error] [${context}] ${message}`);
}

export function logDiagnostic(tag: string, message: string): void {
  console.log(`[Diagnostic] [${tag}] ${message}`);
}

export function logPagesDeployment(step: string, details?: Record<string, unknown>): void {
  const detailStr = details ? ` | ${JSON.stringify(details)}` : "";
  console.log(`[PagesDeploy] ${step}${detailStr}`);
}
