import { Env } from "../../env";
import { Transport, TransportResult } from "../shared/google-html-engine/types";

const UPSTREAM_ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml";
const FALLBACK_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const LANG_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const SAFE_USER_AGENT_PATTERN = /^Mozilla\/5\.0 \([a-zA-Z0-9_.;\-\s]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/[0-9.]+ Safari\/537\.36$/;

function isStrictChrome(ua: string | undefined): boolean {
  if (!ua || ua.length > 256) return false;
  return SAFE_USER_AGENT_PATTERN.test(ua) && !ua.includes("Edg/") && !ua.includes("OPR/") && !ua.includes("Brave") && !ua.includes("Vivaldi");
}

function extractDetectedLang(payload: unknown): string | null {
  const candidate = (payload as any)?.[1]?.[0];
  return typeof candidate === "string" && LANG_CODE_PATTERN.test(candidate) ? candidate : null;
}

export function createGoogleNmtPaTransport(env: Env): Transport {
  if (!env.GOOGLE_TRANSLATE_API_KEY) throw new Error("GOOGLE_TRANSLATE_API_KEY is required for google-nmt-pa provider");
  const apiKey = env.GOOGLE_TRANSLATE_API_KEY;

  return {
    async send(text, source, target, clientUserAgent, signal): Promise<TransportResult> {
      const userAgent = isStrictChrome(clientUserAgent) ? clientUserAgent! : FALLBACK_USER_AGENT;
      const headers = new Headers({
        "Content-Type": "application/json+protobuf",
        "User-Agent": userAgent,
        "X-Goog-Api-Key": apiKey,
      });

      const url = new URL(UPSTREAM_ENDPOINT);
      url.searchParams.set("key", apiKey);

      const response = await fetch(url.toString(), {
        method: "POST", headers, body: JSON.stringify([[[text], source, target], "te"]), signal,
      });

      if (!response.ok) throw new Error(`upstream ${response.status}`);
      const payload = (await response.json().catch(() => null)) as unknown;
      const translatedHtml = Array.isArray(payload) ? (payload as any)?.[0]?.[0] : undefined;
      if (typeof translatedHtml !== "string") throw new Error("unexpected upstream response shape");
      return { translatedHtml, detectedLang: source === "auto" ? extractDetectedLang(payload) : null };
    },
  };
}
