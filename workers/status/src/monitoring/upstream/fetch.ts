import { logDiagnostic, logUpstreamParseError, logUpstreamPollError } from "../../logger";
import { egressFetch } from "../../net/egress";

const FETCH_TIMEOUT_MS = 5000;
const FETCH_ATTEMPTS = 3;
const USER_AGENT = "MontageSubs-Status-Probe/1.0";
const JSON_ACCEPT = "application/json";
const FEED_ACCEPT = "application/rss+xml, text/xml, */*";

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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
        headers: { "User-Agent": USER_AGENT, Accept: accept },
      });

      lastStatus = response.status;
      logDiagnostic(
        `Upstream:${serviceName}`,
        `Attempt ${attempt} | URL: ${url} | Status: ${response.status} | Latency: ${Date.now() - started}ms`,
      );

      if (response.ok) {
        const rawText = await response.text();
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
