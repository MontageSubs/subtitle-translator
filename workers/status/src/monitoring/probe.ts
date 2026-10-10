import { ProbeErrorType, ProbeResult } from "../types";
import { logDiagnostic } from "../logger";
import { egressFetch } from "../upstream/egress";
import { isGooglePaAuthFailure, postGooglePa, readGooglePaTranslation } from "../upstream/googlePa";
import { postMicrosoftEdge, readMicrosoftEdgeTranslation } from "../upstream/microsoftEdge";
import { readPaSessionToken } from "../upstream/paSessionStore";
import { CHROME_USER_AGENT, EDGE_USER_AGENT } from "../upstream/userAgents";
import {
  AttemptContext,
  AttemptOutcome,
  buildValidatedResult,
  classifyFailedStatus,
  isSuccessStatus,
  readJsonBody,
  runProbe,
  toSnippet,
} from "./probeRunner";

const PANGRAM_TEXT = "The quick brown fox jumps over the lazy dog.";
const FRONTEND_ICON_EXTENSIONS = ["svg", "ico", "png"];

const withTrailingSlash = (url: string): string => (url.endsWith("/") ? url : `${url}/`);

const cacheBusted = (url: string): string => `${url}?_t=${Date.now()}`;

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function probeFrontend(siteUrl: string, retries = 2): Promise<ProbeResult> {
  const baseUrl = withTrailingSlash(siteUrl);
  const componentId = "web_app_frontend";

  return runProbe({
    logTag: "ProbeFrontend",
    failureLabel: componentId,
    componentId,
    retries,
    attempt: async ({ signal, attempt, elapsed }): Promise<AttemptOutcome> => {
      const request = (url: string, method: string) =>
        egressFetch(cacheBusted(url), { method, signal });

      let attemptedUrl = "";
      let response!: Response;
      let ok = false;
      for (const extension of FRONTEND_ICON_EXTENSIONS) {
        attemptedUrl = `${baseUrl}favicon.${extension}`;
        response = await request(attemptedUrl, "HEAD");
        ok = isSuccessStatus(response.status);
        if (ok) break;
      }
      if (!ok) {
        attemptedUrl = baseUrl;
        response = await request(baseUrl, "GET");
        ok = isSuccessStatus(response.status);
      }

      const snippet = ok ? "" : await response.text().catch(() => "");
      const latencyMs = elapsed();
      logDiagnostic(
        "ProbeFrontend",
        `Attempt: ${attempt} | Target: ${attemptedUrl} | Status: ${response.status} | Latency: ${latencyMs}ms | OK: ${ok}`,
      );

      return {
        result: {
          componentId,
          success: ok,
          httpStatus: response.status,
          latencyMs,
          detail: ok ? undefined : `HTTP ${response.status}`,
          errorType: ok ? undefined : "http_error",
          responseSnippet: toSnippet(snippet),
        },
      };
    },
  });
}

async function loadGooglePaSessionToken(db?: D1Database): Promise<string | null> {
  if (!db) {
    logDiagnostic("ProbeGooglePA", "D1 database binding not provided");
    return null;
  }
  try {
    const token = await readPaSessionToken(db);
    logDiagnostic("ProbeGooglePA", `Session token loaded from D1: ${Boolean(token)}`);
    return token;
  } catch (error) {
    logDiagnostic("ProbeGooglePA", `D1 session token lookup error: ${describeError(error)}`);
    return null;
  }
}

async function attemptGooglePa(
  sessionToken: string | null,
  { signal, attempt, elapsed }: AttemptContext,
): Promise<AttemptOutcome> {
  const componentId = "google_translate_public";
  const response = await postGooglePa({
    key: sessionToken,
    texts: [PANGRAM_TEXT],
    source: "en",
    target: "es",
    userAgent: CHROME_USER_AGENT,
    signal,
  });
  const failure = (fields: Partial<ProbeResult>): ProbeResult => ({
    componentId,
    success: false,
    httpStatus: response.status,
    latencyMs: elapsed(),
    ...fields,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const isAuthError = isGooglePaAuthFailure(response.status, body);
    const errorType: ProbeErrorType = isAuthError ? "auth_error" : classifyFailedStatus(response.status);
    const isRateLimited = response.status === 429;
    const result = failure({
      detail: isAuthError ? "auth_error" : isRateLimited ? "rate_limited" : `HTTP ${response.status}`,
      errorType,
      responseSnippet: toSnippet(body),
    });
    logDiagnostic(
      "ProbeGooglePA",
      `Attempt: ${attempt} | HTTP: ${response.status} | Type: ${errorType} | Latency: ${result.latencyMs}ms`,
    );
    return { result, abort: isAuthError || isRateLimited };
  }

  const rawText = await response.text().catch(() => "");
  let translated: string | null;
  try {
    translated = readGooglePaTranslation(JSON.parse(rawText));
  } catch {
    logDiagnostic("ProbeGooglePA", `Attempt: ${attempt} | JSON parse failed: ${rawText.slice(0, 100)}`);
    return {
      result: failure({ detail: "invalid_json_response", errorType: "schema_error", responseSnippet: toSnippet(rawText) }),
    };
  }

  const valid = translated !== null && translated.trim().length > 0;
  const result: ProbeResult = valid
    ? { componentId, success: true, httpStatus: response.status, latencyMs: elapsed() }
    : failure({ detail: "empty_translation", errorType: "schema_error", responseSnippet: rawText.slice(0, 300) });
  logDiagnostic(
    "ProbeGooglePA",
    `Attempt: ${attempt} | Success: ${valid} | Latency: ${result.latencyMs}ms | Sample: ${String(translated).slice(0, 40)}`,
  );
  return { result };
}

export async function probeGooglePA(db?: D1Database, retries = 2): Promise<ProbeResult> {
  const sessionToken = await loadGooglePaSessionToken(db);
  return runProbe({
    logTag: "ProbeGooglePA",
    failureLabel: "google_pa",
    componentId: "google_translate_public",
    retries,
    attempt: (context) => attemptGooglePa(sessionToken, context),
  });
}

export function probeMicrosoftEdge(retries = 2): Promise<ProbeResult> {
  const componentId = "microsoft_translator_edge";
  return runProbe({
    logTag: "ProbeMicrosoftEdge",
    failureLabel: componentId,
    componentId,
    retries,
    attempt: async ({ signal, attempt, elapsed }) => {
      const response = await postMicrosoftEdge({ texts: [PANGRAM_TEXT], source: "en", target: "es", userAgent: EDGE_USER_AGENT, signal });
      const latencyMs = elapsed();

      const body = isSuccessStatus(response.status)
        ? await readJsonBody(response, (json) => {
            const text = readMicrosoftEdgeTranslation(Array.isArray(json) ? json[0] : undefined);
            return text !== null && text.trim().length > 0;
          })
        : { valid: false, rawText: await response.text().catch(() => ""), errorType: classifyFailedStatus(response.status) };

      logDiagnostic(
        "ProbeMicrosoftEdge",
        `Attempt: ${attempt} | Status: ${response.status} | Success: ${body.valid} | Latency: ${latencyMs}ms`,
      );
      return { result: buildValidatedResult({ componentId, status: response.status, latencyMs, ...body }) };
    },
  });
}

export function probeStatusDistribution(statusBaseUrl: string, retries = 2): Promise<ProbeResult> {
  const componentId = "status_distribution";
  const target = `${withTrailingSlash(statusBaseUrl)}status.json`;
  logDiagnostic("ProbeStatusDistribution", `Target URL configured: ${target}`);

  return runProbe({
    logTag: "ProbeStatusDistribution",
    failureLabel: componentId,
    componentId,
    retries,
    attempt: async ({ signal, attempt, elapsed }) => {
      const response = await egressFetch(cacheBusted(target), { method: "GET", signal });
      const latencyMs = elapsed();

      const body =
        response.status === 200
          ? await readJsonBody(response, (json) => Boolean(json && typeof json === "object" && json.meta && json.summary))
          : { valid: false, rawText: await response.text().catch(() => ""), errorType: "http_error" as ProbeErrorType };

      logDiagnostic(
        "ProbeStatusDistribution",
        `Attempt: ${attempt} | Target: ${target} | Status: ${response.status} | Valid: ${body.valid} | Latency: ${latencyMs}ms | Snippet: ${body.rawText.slice(0, 80)}`,
      );
      return { result: buildValidatedResult({ componentId, status: response.status, latencyMs, ...body }) };
    },
  });
}
