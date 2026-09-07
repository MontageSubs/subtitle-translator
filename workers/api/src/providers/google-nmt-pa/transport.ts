import { Env } from '../../config/env';
import { Transport, TransportResult } from "../shared/google-html-engine/types";
import { getSessionToken, refreshSessionToken, CHROME_UA, isStrictChrome } from './sessionLoader';
import { parseUpstreamError } from '../shared/errors';
import { egressBrowserFetch } from '../../net/egress';

const UPSTREAM_ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml";
const LANG_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

function extractDetectedLang(payload: unknown): string | null {
  const candidate = (payload as any)?.[1]?.[0];
  return typeof candidate === "string" && LANG_CODE_PATTERN.test(candidate) ? candidate : null;
}

async function fetchWithKey(apiKey: string, bodyStr: string, userAgent: string, signal?: AbortSignal) {
  const url = new URL(UPSTREAM_ENDPOINT);
  url.searchParams.set("key", apiKey);
  return await egressBrowserFetch(url.toString(), {
    method: "POST",
    userAgent,
    origin: "https://translate.google.com",
    secFetchSite: "cross-site",
    secFetchMode: "cors",
    secFetchDest: "empty",
    headers: { "Content-Type": "application/json+protobuf", "X-Goog-Api-Key": apiKey },
    body: bodyStr,
    signal,
  });
}

export function createGoogleNmtPaTransport(env: Env): Transport {
  return {
    async send(text, source, target, clientUserAgent, signal): Promise<TransportResult> {
      const userAgent = isStrictChrome(clientUserAgent) ? clientUserAgent! : CHROME_UA;
      const bodyStr = JSON.stringify([[[text], source, target], "te"]);
      
      let apiKey = await getSessionToken(env, clientUserAgent);
      let response = await fetchWithKey(apiKey, bodyStr, userAgent, signal);
      let responseText = await response.text();
      
      let isAuthError = response.status === 401 || response.status === 403;
      if (response.status === 400 && (responseText.includes("API_KEY_INVALID") || responseText.includes("API key not valid"))) {
        isAuthError = true;
      }
      
      if (isAuthError) {
        apiKey = await refreshSessionToken(env, clientUserAgent);
        response = await fetchWithKey(apiKey, bodyStr, userAgent, signal);
        responseText = await response.text();
      }
      
      if (!response.ok) {
        throw parseUpstreamError(response.status, responseText, 'google-nmt-pa');
      }
      
      const payload = JSON.parse(responseText);
      const translatedHtml = Array.isArray(payload) ? (payload as any)?.[0]?.[0] : undefined;
      
      if (typeof translatedHtml !== "string") throw new Error("unexpected upstream response shape");
      return { translatedHtml, detectedLang: source === "auto" ? extractDetectedLang(payload) : null };
    },
  };
}
