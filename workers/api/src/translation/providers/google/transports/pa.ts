import type { Env } from "../../../../config/env";
import { egressBrowserFetch } from "../../../../upstream/egress";
import { parseUpstreamError } from "../../../errors";
import type { GoogleHtmlTransport } from "../transport";
import { getSessionToken, refreshSessionToken, resolveUserAgent } from "./paSession";

const ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml";
const PROVIDER_ID = "google-nmt-pa";
const LANG_CODE_PATTERN = /^[a-zA-Z]{2,3}(-[A-Za-z0-9]+)*$/;

function extractDetectedLang(payload: unknown): string | null {
  const candidate = (payload as { 1?: { 0?: unknown } })?.[1]?.[0];
  return typeof candidate === "string" && LANG_CODE_PATTERN.test(candidate) ? candidate : null;
}

function isAuthFailure(status: number, body: string): boolean {
  return status === 401 || status === 403 || (status === 400 && (body.includes("API_KEY_INVALID") || body.includes("API key not valid")));
}

function post(apiKey: string, body: string, userAgent: string, signal: AbortSignal): Promise<Response> {
  return egressBrowserFetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    userAgent,
    origin: "https://translate.google.com",
    secFetchSite: "cross-site",
    secFetchMode: "cors",
    secFetchDest: "empty",
    headers: { "Content-Type": "application/json+protobuf", "X-Goog-Api-Key": apiKey },
    body,
    signal,
  });
}

export function createGooglePaTransport(env: Env): GoogleHtmlTransport {
  return {
    async send(html, source, target, clientUserAgent, signal) {
      const userAgent = resolveUserAgent(clientUserAgent);
      const body = JSON.stringify([[[html], source, target], "te"]);
      let response = await post(await getSessionToken(env, clientUserAgent), body, userAgent, signal);
      let text = await response.text();
      if (isAuthFailure(response.status, text)) {
        response = await post(await refreshSessionToken(env, clientUserAgent), body, userAgent, signal);
        text = await response.text();
      }
      if (!response.ok) throw parseUpstreamError(response.status, text, PROVIDER_ID);
      const payload: unknown = JSON.parse(text);
      const translatedHtml = Array.isArray(payload) ? (payload as { 0?: { 0?: unknown } })[0]?.[0] : undefined;
      if (typeof translatedHtml !== "string") throw new Error("unexpected upstream response shape");
      return { translatedHtml, detectedLang: source === "auto" ? extractDetectedLang(payload) : null };
    },
  };
}
