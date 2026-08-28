import { Env } from '../../config/env';
import { Transport, TransportResult } from "../shared/google-html-engine/types";

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

interface V2Response {
  data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] };
}

export function createGoogleNmtV2Transport(env: Env): Transport {
  if (!env.GOOGLE_TRANSLATE_V2_API_KEY) throw new Error("GOOGLE_TRANSLATE_V2_API_KEY is required for google-nmt-v2 provider");
  const apiKey = env.GOOGLE_TRANSLATE_V2_API_KEY;

  return {
    async send(text, source, target, _clientUserAgent, signal): Promise<TransportResult> {
      const body: Record<string, unknown> = { q: [text], target, format: "html", model: "nmt" };
      if (source !== "auto") body.source = source;

      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) throw new Error(`upstream ${response.status}`);
      const payload = (await response.json().catch(() => null)) as V2Response | null;
      const translation = payload?.data?.translations?.[0];
      if (!translation || typeof translation.translatedText !== "string") throw new Error("unexpected upstream response shape");
      return { translatedHtml: translation.translatedText, detectedLang: source === "auto" ? translation.detectedSourceLanguage || null : null };
    },
  };
}
