import type { Env } from "../../../../config/env";
import { resolveChromeUserAgent } from "../../../../upstream/clientUserAgent";
import { isGooglePaAuthFailure, postGooglePa, readGooglePaDetectedLanguage, readGooglePaTranslation } from "../../../../upstream/googlePa";
import { paRoute, type PaRegion } from "../../../../upstream/paRegion";
import { parseUpstreamError } from "../../../errors";
import type { GoogleHtmlTransport } from "../transport";
import { getSessionToken, refreshSessionToken } from "./paSession";

const PROVIDER_ID = "google-nmt-pa";

export function createGooglePaTransport(env: Env, preferred: PaRegion): GoogleHtmlTransport {
  const route = paRoute(preferred);
  let cursor = 0;

  return {
    async send(html, source, target, clientUserAgent, signal) {
      const attempt = cursor;
      const region = route[attempt]!;
      const userAgent = resolveChromeUserAgent(clientUserAgent);
      const post = (key: string) => postGooglePa({ key, texts: [html], source, target, userAgent, region, signal });
      try {
        let response = await post(await getSessionToken(env, clientUserAgent));
        let text = await response.text();
        if (isGooglePaAuthFailure(response.status, text)) {
          response = await post(await refreshSessionToken(env, clientUserAgent));
          text = await response.text();
        }
        if (!response.ok) throw parseUpstreamError(response.status, text, PROVIDER_ID);
        const payload: unknown = JSON.parse(text);
        const translatedHtml = readGooglePaTranslation(payload);
        if (translatedHtml === null) throw new Error("unexpected upstream response shape");
        return { translatedHtml, detectedLang: source === "auto" ? readGooglePaDetectedLanguage(payload) : null };
      } catch (error) {
        if (!signal.aborted && cursor === attempt) cursor = (attempt + 1) % route.length;
        throw error;
      }
    },
  };
}
