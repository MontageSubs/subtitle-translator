import { logDiagnostic, logUpstreamParseError, logUpstreamPollError } from "../../logger";
import { egressFetch } from "../../upstream/egress";

const FETCH_TIMEOUT_MS = 5000;
const FETCH_ATTEMPTS = 3;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const JSON_ACCEPT = "application/json";
const FEED_ACCEPT = "application/rss+xml, text/xml, */*";

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function readBoundedText(response: Response): Promise<string | null> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    received += chunk.value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchBody<T>(
  serviceName: string,
  url: string,
  accept: string,
  parse: (rawText: string) => T,
): Promise<T | null> {
  let lastError = "";
  let lastStatus = 0;
  let lastSnippet = "";

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await egressFetch(url, {
        signal: controller.signal,
        headers: { Accept: accept },
      });

      lastStatus = response.status;
      logDiagnostic(
        `Upstream:${serviceName}`,
        `Attempt ${attempt} | URL: ${url} | Status: ${response.status} | Latency: ${Date.now() - started}ms`,
      );

      if (response.ok) {
        const rawText = await readBoundedText(response);
        if (rawText === null) {
          logUpstreamParseError(serviceName, url, `Response exceeded ${MAX_RESPONSE_BYTES} bytes`, "");
          return null;
        }
        try {
          return parse(rawText);
        } catch (parseError) {
          logUpstreamParseError(serviceName, url, `JSON parse failed: ${describeError(parseError)}`, rawText.slice(0, 300));
          return null;
        }
      }

      lastSnippet = await response.text().catch(() => "");
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      lastError = isAbort ? "Request timed out" : describeError(error);
      lastStatus = 0;
      logDiagnostic(`Upstream:${serviceName}`, `Attempt ${attempt} failed | URL: ${url} | Error: ${lastError}`);
    } finally {
      clearTimeout(timer);
    }
  }

  logUpstreamPollError(serviceName, url, lastStatus, lastError, lastSnippet || undefined);
  return null;
}

export const fetchJson = <T = any>(serviceName: string, url: string): Promise<T | null> =>
  fetchBody(serviceName, url, JSON_ACCEPT, (rawText) => JSON.parse(rawText) as T);

export const fetchText = (serviceName: string, url: string): Promise<string | null> =>
  fetchBody(serviceName, url, FEED_ACCEPT, (rawText) => rawText);
