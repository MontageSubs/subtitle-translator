import { ProbeResult, ProbeErrorType } from "./types";
import { logProbeFailure, logDiagnostic } from "./logger";
import { tursoHealthUrl } from "./turso";

const PROBE_TIMEOUT_MS = 6000;
const PANGRAM_TEXT = "The quick brown fox jumps over the lazy dog.";

export async function probeFrontend(
  siteUrl: string,
  retries = 2,
): Promise<ProbeResult> {
  let lastResult: ProbeResult | null = null;
  const baseUrl = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  const extensions = ["svg", "ico", "png"];

  for (let i = 0; i <= retries; i++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      let response: Response | null = null;
      let ok = false;
      let attemptedUrl = "";

      for (const ext of extensions) {
        const target = `${baseUrl}favicon.${ext}`;
        attemptedUrl = target;
        response = await fetch(`${target}?_t=${Date.now()}`, {
          method: "HEAD",
          signal: controller.signal,
          headers: { "User-Agent": "MontageSubs-Status-Probe/1.0" },
        });

        ok = response.status >= 200 && response.status < 400;
        if (ok) break;
      }

      if (!ok) {
        attemptedUrl = baseUrl;
        response = await fetch(`${baseUrl}?_t=${Date.now()}`, {
          method: "GET",
          signal: controller.signal,
          headers: { "User-Agent": "MontageSubs-Status-Probe/1.0" },
        });
        ok = response.status >= 200 && response.status < 400;
      }

      let responseSnippet = "";
      if (response && !ok) {
        responseSnippet = await response.text().catch(() => "");
      }

      const latencyMs = Date.now() - started;
      const errorType: ProbeErrorType | undefined = ok
        ? undefined
        : response
          ? "http_error"
          : "network_error";

      lastResult = {
        componentId: "web_app_frontend",
        success: ok,
        httpStatus: response ? response.status : 0,
        latencyMs,
        detail: ok
          ? undefined
          : response
            ? `HTTP ${response.status}`
            : "No valid frontend endpoint reachable",
        errorType,
        responseSnippet: responseSnippet.slice(0, 300) || undefined,
      };

      logDiagnostic(
        "ProbeFrontend",
        `Attempt: ${i + 1} | Target: ${attemptedUrl} | Status: ${lastResult.httpStatus} | Latency: ${latencyMs}ms | OK: ${ok}`,
      );

      if (ok) return lastResult;
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      lastResult = {
        componentId: "web_app_frontend",
        success: false,
        httpStatus: 0,
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : String(error),
        errorType: isAbort ? "timeout" : "network_error",
      };
      logDiagnostic(
        "ProbeFrontend",
        `Attempt: ${i + 1} | Error: ${lastResult.detail} | Type: ${lastResult.errorType}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastResult && !lastResult.success) {
    logProbeFailure(
      "web_app_frontend",
      lastResult.errorType || "http_error",
      lastResult.latencyMs,
      lastResult.httpStatus,
      lastResult.detail,
      lastResult.responseSnippet,
    );
  }

  return lastResult!;
}

export async function probeGooglePA(
  db?: D1Database,
  retries = 2,
): Promise<ProbeResult> {
  let sessionToken: string | null = null;

  if (db) {
    try {
      const row = await db
        .prepare(
          "SELECT value FROM system_config WHERE key = 'pa_session_token' LIMIT 1",
        )
        .first<{ value: string }>();
      sessionToken = row?.value || null;
      logDiagnostic("ProbeGooglePA", `Session token loaded from D1: ${Boolean(sessionToken)}`);
    } catch (dbErr) {
      sessionToken = null;
      logDiagnostic(
        "ProbeGooglePA",
        `D1 session token lookup error: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      );
    }
  } else {
    logDiagnostic("ProbeGooglePA", "D1 database binding not provided");
  }

  let lastResult: ProbeResult | null = null;

  for (let i = 0; i <= retries; i++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const url = new URL(
        "https://translate-pa.googleapis.com/v1/translateHtml",
      );
      if (sessionToken) {
        url.searchParams.set("key", sessionToken);
      }

      const headers = new Headers({
        "Content-Type": "application/json+protobuf",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://translate.google.com",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
      });

      if (sessionToken) {
        headers.set("X-Goog-Api-Key", sessionToken);
      }

      const bodyStr = JSON.stringify([[[PANGRAM_TEXT], "en", "es"], "te"]);

      const response = await fetch(url.toString(), {
        method: "POST",
        signal: controller.signal,
        headers,
        body: bodyStr,
      });

      let responseText = "";
      if (!response.ok) {
        try {
          responseText = await response.text();
        } catch {}

        let isAuthError = response.status === 401 || response.status === 403;
        if (
          response.status === 400 &&
          responseText &&
          (responseText.includes("API_KEY_INVALID") ||
            responseText.includes("API key not valid"))
        ) {
          isAuthError = true;
        }

        const errorType: ProbeErrorType = isAuthError
          ? "auth_error"
          : response.status === 429
            ? "rate_limited"
            : "http_error";

        lastResult = {
          componentId: "google_translate_public",
          success: false,
          httpStatus: response.status,
          latencyMs: Date.now() - started,
          detail: isAuthError
            ? "auth_error"
            : response.status === 429
              ? "rate_limited"
              : `HTTP ${response.status}`,
          errorType,
          responseSnippet: responseText.slice(0, 300) || undefined,
        };

        logDiagnostic(
          "ProbeGooglePA",
          `Attempt: ${i + 1} | HTTP: ${response.status} | Type: ${errorType} | Latency: ${lastResult.latencyMs}ms`,
        );

        if (isAuthError || response.status === 429) {
          break;
        }
        continue;
      }

      let json: any;
      let rawText = "";
      try {
        rawText = await response.text();
        json = JSON.parse(rawText);
      } catch (parseErr) {
        lastResult = {
          componentId: "google_translate_public",
          success: false,
          httpStatus: response.status,
          latencyMs: Date.now() - started,
          detail: "invalid_json_response",
          errorType: "schema_error",
          responseSnippet: rawText.slice(0, 300) || undefined,
        };
        logDiagnostic(
          "ProbeGooglePA",
          `Attempt: ${i + 1} | JSON parse failed: ${rawText.slice(0, 100)}`,
        );
        continue;
      }

      const translated = Array.isArray(json) ? json?.[0]?.[0] : undefined;
      const valid =
        typeof translated === "string" && translated.trim().length > 0;

      const latencyMs = Date.now() - started;
      lastResult = {
        componentId: "google_translate_public",
        success: valid,
        httpStatus: response.status,
        latencyMs,
        detail: valid ? undefined : "empty_translation",
        errorType: valid ? undefined : "schema_error",
        responseSnippet: valid ? undefined : rawText.slice(0, 300),
      };

      logDiagnostic(
        "ProbeGooglePA",
        `Attempt: ${i + 1} | Success: ${valid} | Latency: ${latencyMs}ms | Sample: ${String(translated).slice(0, 40)}`,
      );

      if (valid) return lastResult;
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      lastResult = {
        componentId: "google_translate_public",
        success: false,
        httpStatus: 0,
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : String(error),
        errorType: isAbort ? "timeout" : "network_error",
      };
      logDiagnostic(
        "ProbeGooglePA",
        `Attempt: ${i + 1} | Exception: ${lastResult.detail} | Type: ${lastResult.errorType}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastResult && !lastResult.success) {
    logProbeFailure(
      "google_pa",
      lastResult.errorType || "http_error",
      lastResult.latencyMs,
      lastResult.httpStatus,
      lastResult.detail,
      lastResult.responseSnippet,
    );
  }

  return lastResult!;
}

export async function probeMicrosoftEdge(retries = 2): Promise<ProbeResult> {
  let lastResult: ProbeResult | null = null;

  for (let i = 0; i <= retries; i++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const url = new URL("https://edge.microsoft.com/translate/translatetext");
      url.searchParams.set("from", "en");
      url.searchParams.set("to", "es");
      url.searchParams.set("isEnterpriseClient", "false");

      const response = await fetch(url.toString(), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
          Accept: "*/*",
        },
        body: JSON.stringify([PANGRAM_TEXT]),
      });

      const latencyMs = Date.now() - started;
      const ok = response.status >= 200 && response.status < 400;

      let valid = false;
      let rawText = "";
      let errorType: ProbeErrorType = "http_error";

      if (ok) {
        try {
          rawText = await response.text();
          const json = JSON.parse(rawText) as any[];
          if (
            Array.isArray(json) &&
            typeof json[0]?.translations?.[0]?.text === "string" &&
            json[0].translations[0].text.trim().length > 0
          ) {
            valid = true;
          } else {
            errorType = "schema_error";
          }
        } catch {
          errorType = "schema_error";
        }
      } else {
        rawText = await response.text().catch(() => "");
        errorType =
          response.status === 429
            ? "rate_limited"
            : response.status === 401 || response.status === 403
              ? "auth_error"
              : "http_error";
      }

      lastResult = {
        componentId: "microsoft_translator_edge",
        success: valid,
        httpStatus: response.status,
        latencyMs,
        detail: valid
          ? undefined
          : errorType === "schema_error"
            ? "schema_mismatch"
            : `HTTP ${response.status}`,
        errorType: valid ? undefined : errorType,
        responseSnippet: valid ? undefined : rawText.slice(0, 300) || undefined,
      };

      logDiagnostic(
        "ProbeMicrosoftEdge",
        `Attempt: ${i + 1} | Status: ${response.status} | Success: ${valid} | Latency: ${latencyMs}ms`,
      );

      if (valid) return lastResult;
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      lastResult = {
        componentId: "microsoft_translator_edge",
        success: false,
        httpStatus: 0,
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : String(error),
        errorType: isAbort ? "timeout" : "network_error",
      };
      logDiagnostic(
        "ProbeMicrosoftEdge",
        `Attempt: ${i + 1} | Exception: ${lastResult.detail}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastResult && !lastResult.success) {
    logProbeFailure(
      "microsoft_translator_edge",
      lastResult.errorType || "http_error",
      lastResult.latencyMs,
      lastResult.httpStatus,
      lastResult.detail,
      lastResult.responseSnippet,
    );
  }

  return lastResult!;
}

export async function probeStatusDistribution(
  statusBaseUrl: string,
  retries = 2,
): Promise<ProbeResult> {
  let lastResult: ProbeResult | null = null;
  const target = statusBaseUrl.endsWith("/")
    ? `${statusBaseUrl}status.json`
    : `${statusBaseUrl}/status.json`;

  logDiagnostic("ProbeStatusDistribution", `Target URL configured: ${target}`);

  for (let i = 0; i <= retries; i++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(`${target}?_t=${Date.now()}`, {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": "MontageSubs-Status-Probe/1.0" },
      });
      const latencyMs = Date.now() - started;
      const ok = response.status === 200;

      let valid = false;
      let rawText = "";
      let errorType: ProbeErrorType = "http_error";

      if (ok) {
        try {
          rawText = await response.text();
          const json = JSON.parse(rawText) as any;
          if (json && typeof json === "object" && json.meta && json.summary) {
            valid = true;
          } else {
            errorType = "schema_error";
          }
        } catch {
          errorType = "schema_error";
        }
      } else {
        rawText = await response.text().catch(() => "");
      }

      lastResult = {
        componentId: "status_distribution",
        success: valid,
        httpStatus: response.status,
        latencyMs,
        detail: valid
          ? undefined
          : errorType === "schema_error"
            ? "schema_mismatch"
            : `HTTP ${response.status}`,
        errorType: valid ? undefined : errorType,
        responseSnippet: valid ? undefined : rawText.slice(0, 300) || undefined,
      };

      logDiagnostic(
        "ProbeStatusDistribution",
        `Attempt: ${i + 1} | Target: ${target} | Status: ${response.status} | Valid: ${valid} | Latency: ${latencyMs}ms | Snippet: ${rawText.slice(0, 80)}`,
      );

      if (valid) return lastResult;
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      lastResult = {
        componentId: "status_distribution",
        success: false,
        httpStatus: 0,
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : String(error),
        errorType: isAbort ? "timeout" : "network_error",
      };
      logDiagnostic(
        "ProbeStatusDistribution",
        `Attempt: ${i + 1} | Error: ${lastResult.detail} | Target: ${target}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastResult && !lastResult.success) {
    logProbeFailure(
      "status_distribution",
      lastResult.errorType || "http_error",
      lastResult.latencyMs,
      lastResult.httpStatus,
      lastResult.detail,
      lastResult.responseSnippet,
    );
  }

  return lastResult!;
}

