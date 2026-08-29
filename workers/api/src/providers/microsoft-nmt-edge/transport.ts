import { parseUpstreamError } from "../shared/errors";

export const DEFAULT_EDGE_DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0";

const EDGE_UA_PATTERN = /^Mozilla\/5\.0 \([a-zA-Z0-9_.;\-\s/]+\) AppleWebKit\/[0-9.]+ \(KHTML, like Gecko\) (Chrome\/[0-9.]+ )?(Mobile\/[a-zA-Z0-9]+ )?(Safari\/[0-9.]+ )?(Edg|EdgA|EdgiOS|Edge)\/[0-9.]+$/;

export function resolveEdgeUserAgent(clientUserAgent?: string): string {
  if (!clientUserAgent || clientUserAgent.length > 300) {
    return DEFAULT_EDGE_DESKTOP_UA;
  }
  const cleanUa = clientUserAgent.trim();
  if (EDGE_UA_PATTERN.test(cleanUa) && (cleanUa.includes("Edg/") || cleanUa.includes("EdgA/") || cleanUa.includes("EdgiOS/"))) {
    return cleanUa;
  }
  return DEFAULT_EDGE_DESKTOP_UA;
}

export interface MicrosoftTranslateResponse {
  detectedLanguage?: {
    language: string;
    score: number;
  };
  translations?: Array<{
    text: string;
    to: string;
  }>;
}

export async function callMicrosoftApi(
  payload: string[],
  sourceLang: string,
  targetLang: string,
  userAgent: string
): Promise<MicrosoftTranslateResponse[]> {
  const url = new URL("https://edge.microsoft.com/translate/translatetext");
  if (sourceLang) {
    url.searchParams.set("from", sourceLang);
  }
  url.searchParams.set("to", targetLang);
  url.searchParams.set("isEnterpriseClient", "false");

  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      "Accept": "*/*"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    throw parseUpstreamError(resp.status, errorText, "microsoft-nmt-edge");
  }

  const result = await resp.json() as MicrosoftTranslateResponse[];
  return result;
}
