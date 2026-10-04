import { ProbeErrorType, ProbeResult } from "../types";
import { logDiagnostic, logProbeFailure } from "../logger";

const PROBE_TIMEOUT_MS = 6000;
const SNIPPET_LIMIT = 300;

export interface AttemptContext {
  signal: AbortSignal;
  attempt: number;
  elapsed: () => number;
}

export interface AttemptOutcome {
  result: ProbeResult;
  abort?: boolean;
}

export interface ProbeSpec {
  logTag: string;
  failureLabel: string;
  componentId: string;
  retries: number;
  attempt: (context: AttemptContext) => Promise<AttemptOutcome>;
}

export const toSnippet = (text: string): string | undefined => text.slice(0, SNIPPET_LIMIT) || undefined;

export const isSuccessStatus = (status: number): boolean => status >= 200 && status < 400;

export function classifyFailedStatus(status: number): ProbeErrorType {
  if (status === 429) return "rate_limited";
  return status === 401 || status === 403 ? "auth_error" : "http_error";
}

function failureFromError(componentId: string, error: unknown, latencyMs: number): ProbeResult {
  const isAbort = error instanceof Error && error.name === "AbortError";
  return {
    componentId,
    success: false,
    httpStatus: 0,
    latencyMs,
    detail: error instanceof Error ? error.message : String(error),
    errorType: isAbort ? "timeout" : "network_error",
  };
}

export async function runProbe(spec: ProbeSpec): Promise<ProbeResult> {
  let lastResult: ProbeResult | null = null;

  for (let attempt = 1; attempt <= spec.retries + 1; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const elapsed = () => Date.now() - started;

    try {
      const outcome = await spec.attempt({ signal: controller.signal, attempt, elapsed });
      lastResult = outcome.result;
      if (lastResult.success) return lastResult;
      if (outcome.abort) break;
    } catch (error) {
      lastResult = failureFromError(spec.componentId, error, elapsed());
      logDiagnostic(spec.logTag, `Attempt: ${attempt} | Error: ${lastResult.detail} | Type: ${lastResult.errorType}`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastResult && !lastResult.success) {
    logProbeFailure(
      spec.failureLabel,
      lastResult.errorType || "http_error",
      lastResult.latencyMs,
      lastResult.httpStatus,
      lastResult.detail,
      lastResult.responseSnippet,
    );
  }
  return lastResult!;
}

export interface ValidatedResponse {
  componentId: string;
  status: number;
  latencyMs: number;
  valid: boolean;
  errorType: ProbeErrorType;
  rawText: string;
}

export function buildValidatedResult(response: ValidatedResponse): ProbeResult {
  const { componentId, status, latencyMs, valid, errorType, rawText } = response;
  return {
    componentId,
    success: valid,
    httpStatus: status,
    latencyMs,
    detail: valid ? undefined : errorType === "schema_error" ? "schema_mismatch" : `HTTP ${status}`,
    errorType: valid ? undefined : errorType,
    responseSnippet: valid ? undefined : toSnippet(rawText),
  };
}

export async function readJsonBody(
  response: Response,
  isValid: (json: any) => boolean,
): Promise<{ valid: boolean; rawText: string; errorType: ProbeErrorType }> {
  const rawText = await response.text().catch(() => "");
  try {
    return isValid(JSON.parse(rawText)) ? { valid: true, rawText, errorType: "http_error" } : { valid: false, rawText, errorType: "schema_error" };
  } catch {
    return { valid: false, rawText, errorType: "schema_error" };
  }
}
