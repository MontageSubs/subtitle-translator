import { Env } from '../../config/env';
import { Transport, TransportResult } from "../shared/google-html-engine/types";
import { getSessionToken, refreshSessionToken, CHROME_UA, isStrictChrome } from './sessionLoader';
import { parseUpstreamError } from '../shared/errors';

const UPSTREAM_ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml";
const LANG_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

function extractDetectedLang(payload: unknown): string | null {
  const candidate = (payload as any)?.[1]?.[0];
  return typeof candidate === "string" && LANG_CODE_PATTERN.test(candidate) ? candidate : null;
}

async function fetchWithKey(apiKey: string, bodyStr: string, userAgent: string, signal?: AbortSignal) {
  const headers = new Headers({
    "Content-Type": "application/json+protobuf",
    "User-Agent": userAgent,
    "X-Goog-Api-Key": apiKey,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://translate.google.com",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty"
  });
  const url = new URL(UPSTREAM_ENDPOINT);
  url.searchParams.set("key", apiKey);
  return await fetch(url.toString(), {
    method: "POST", headers, body: bodyStr, signal,
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
