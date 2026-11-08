import { ProbeErrorType, ProbePair, ProbeResult, WebAppProbes } from "../types";
import { logDiagnostic } from "../logger";
import { egressFreshFetch } from "../upstream/egress";
import { isGooglePaAuthFailure, postGooglePa, readGooglePaTranslation } from "../upstream/googlePa";
import { postMicrosoftEdge, readMicrosoftEdgeTranslation } from "../upstream/microsoftEdge";
import { CHROME_USER_AGENT, EDGE_USER_AGENT } from "../upstream/userAgents";
import {
  AttemptContext,
  AttemptOutcome,
  buildValidatedResult,
  classifyFailedStatus,
  isRedirectStatus,
  isSuccessStatus,
  readJsonBody,
  runProbe,
  toSnippet,
} from "./probeRunner";

const PANGRAM_TEXT = "The quick brown fox jumps over the lazy dog.";
const FRONTEND_ICON_EXTENSIONS = ["svg", "ico", "png"];
const FALLBACK_PROBE_RETRIES = 1;

const withTrailingSlash = (url: string): string => (url.endsWith("/") ? url : `${url}/`);

const cacheBusted = (url: string): string => `${url}?_t=${Date.now()}`;

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface FrontendProbeOptions {
  retries?: number;
  acceptRedirect?: boolean;
}

interface AssetVerdict {
  ok: boolean;
  settled: boolean;
  redirectLocation?: string;
  errorType?: ProbeErrorType;
  detail?: string;
}

const redirectTargetHost = (response: Response): string => {
  const location = response.headers.get("location") ?? "";
  return URL.canParse(location) ? new URL(location).hostname : "relative";
};

function judgeIconResponse(response: Response, acceptRedirect: boolean): AssetVerdict {
  if (isRedirectStatus(response.status)) {
    return acceptRedirect
      ? { ok: true, settled: true, redirectLocation: response.headers.get("location") ?? undefined }
      : { ok: false, settled: true, errorType: "unexpected_redirect", detail: `redirected_to:${redirectTargetHost(response)}` };
  }
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, settled: false, errorType: classifyFailedStatus(response.status), detail: `HTTP ${response.status}` };
  }
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().startsWith("image/")
    ? { ok: true, settled: true }
    : { ok: false, settled: true, errorType: "content_mismatch", detail: `unexpected_content_type:${contentType || "none"}` };
}

function probeFrontend(siteUrl: string, options: FrontendProbeOptions = {}): Promise<ProbeResult> {
  const { retries = 2, acceptRedirect = false } = options;
  const baseUrl = withTrailingSlash(siteUrl);
  const componentId = "web_app_frontend";

  return runProbe({
    logTag: "ProbeFrontend",
    failureLabel: componentId,
    componentId,
    retries,
    attempt: async ({ signal, attempt, elapsed }): Promise<AttemptOutcome> => {
      let attemptedUrl = "";
      let response!: Response;
      let verdict!: AssetVerdict;
      for (const extension of FRONTEND_ICON_EXTENSIONS) {
        attemptedUrl = `${baseUrl}favicon.${extension}`;
        response = await egressFreshFetch(cacheBusted(attemptedUrl), { method: "HEAD", signal });
        verdict = judgeIconResponse(response, acceptRedirect);
        if (verdict.ok || verdict.settled) break;
      }

      const latencyMs = elapsed();
      logDiagnostic(
        "ProbeFrontend",
        `Attempt: ${attempt} | Target: ${attemptedUrl} | Status: ${response.status} | Latency: ${latencyMs}ms | OK: ${verdict.ok}${verdict.detail ? ` | ${verdict.detail}` : ""}`,
      );

      return {
        result: {
          componentId,
          success: verdict.ok,
          httpStatus: response.status,
          latencyMs,
          detail: verdict.detail,
          errorType: verdict.errorType,
          redirectLocation: verdict.redirectLocation,
        },
      };
    },
  });
}

const failedProbe = (componentId: string): ProbeResult => ({
  componentId,
  success: false,
  httpStatus: 0,
  latencyMs: 0,
  errorType: "network_error",
});

const ICON_FILE_PATTERN = /favicon\.(?:svg|ico|png)$/;

function resolveRelocatedBaseUrl(location: string | undefined, probedUrl: string, primaryUrl: string): string | null {
  if (!location || !URL.canParse(location, probedUrl)) return null;
  const target = new URL(location, probedUrl);
  if (target.hostname === new URL(primaryUrl).hostname) return null;
  target.search = "";
  target.hash = "";
  target.pathname = target.pathname.replace(ICON_FILE_PATTERN, "");
  return withTrailingSlash(target.href);
}

export async function probeWebApp(siteUrl: string, fallbackUrl: string): Promise<WebAppProbes> {
  const primary = await probeFrontend(siteUrl).catch(() => failedProbe("web_app_frontend"));
  if (primary.success || !fallbackUrl) return { primary, fallback: null, redirectTarget: null };

  const fallback = await probeFrontend(fallbackUrl, { retries: FALLBACK_PROBE_RETRIES, acceptRedirect: true }).catch(() =>
    failedProbe("web_app_frontend"),
  );
  const relocatedUrl = fallback.success
    ? resolveRelocatedBaseUrl(fallback.redirectLocation, withTrailingSlash(fallbackUrl), siteUrl)
    : null;
  if (!relocatedUrl) return { primary, fallback, redirectTarget: null };

  const probe = await probeFrontend(relocatedUrl, { retries: FALLBACK_PROBE_RETRIES }).catch(() => failedProbe("web_app_frontend"));
  return { primary, fallback, redirectTarget: { url: relocatedUrl, probe } };
}

const PA_SESSION_TOKEN_KEY = "pa_session_token";

const readPaSessionToken = async (db: D1Database): Promise<string | null> =>
  (await db.prepare("SELECT value FROM system_config WHERE key = ?1").bind(PA_SESSION_TOKEN_KEY).first<{ value: string }>())?.value || null;

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

function probeStatusDistribution(statusBaseUrl: string, retries = 2): Promise<ProbeResult> {
  const componentId = "status_distribution";
  const target = `${withTrailingSlash(statusBaseUrl)}status.json`;
  logDiagnostic("ProbeStatusDistribution", `Target URL configured: ${target}`);

  return runProbe({
    logTag: "ProbeStatusDistribution",
    failureLabel: componentId,
    componentId,
    retries,
    attempt: async ({ signal, attempt, elapsed }) => {
      const response = await egressFreshFetch(cacheBusted(target), { method: "GET", signal });
      const latencyMs = elapsed();

      const body =
        response.status === 200
          ? await readJsonBody(response, (json) => Boolean(json && typeof json === "object" && json.meta && json.summary))
          : {
              valid: false,
              rawText: await response.text().catch(() => ""),
              errorType: (isRedirectStatus(response.status) ? "unexpected_redirect" : "http_error") as ProbeErrorType,
            };

      logDiagnostic(
        "ProbeStatusDistribution",
        `Attempt: ${attempt} | Target: ${target} | Status: ${response.status} | Valid: ${body.valid} | Latency: ${latencyMs}ms | Snippet: ${body.rawText.slice(0, 80)}`,
      );
      return { result: buildValidatedResult({ componentId, status: response.status, latencyMs, ...body }) };
    },
  });
}

export async function probeStatusSite(statusUrl: string, fallbackUrl: string): Promise<ProbePair> {
  const primary = await probeStatusDistribution(statusUrl).catch(() => failedProbe("status_distribution"));
  if (primary.success || !fallbackUrl) return { primary, fallback: null };
  const fallback = await probeStatusDistribution(fallbackUrl, FALLBACK_PROBE_RETRIES).catch(() =>
    failedProbe("status_distribution"),
  );
  return { primary, fallback };
}
