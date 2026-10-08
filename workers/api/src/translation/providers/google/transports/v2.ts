import type { Env } from "../../../../config/env";
import { egressFetch } from "../../../../upstream/egress";
import { parseUpstreamError } from "../../../errors";
import type { GoogleHtmlTransport } from "../transport";

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
const PROVIDER_ID = "google-nmt-v2";

interface V2Response {
  data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] };
}

export function createGoogleV2Transport(env: Env): GoogleHtmlTransport {
  const apiKey = env.GOOGLE_TRANSLATE_V2_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_TRANSLATE_V2_API_KEY is required for google-nmt-v2 provider");

  return {
    async send(html, source, target, _userAgent, signal) {
      const body: Record<string, unknown> = { q: [html], target, format: "html", model: "nmt" };
      if (source !== "auto") body.source = source;
      const response = await egressFetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) throw parseUpstreamError(response.status, await response.text().catch(() => ""), PROVIDER_ID);
      const translation = ((await response.json().catch(() => null)) as V2Response | null)?.data?.translations?.[0];
      if (!translation || typeof translation.translatedText !== "string") throw new Error("unexpected upstream response shape");
      return { translatedHtml: translation.translatedText, detectedLang: source === "auto" ? translation.detectedSourceLanguage || null : null };
    },
  };
}
