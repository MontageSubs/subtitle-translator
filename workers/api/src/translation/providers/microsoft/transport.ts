import { egressBrowserFetch } from "../../../upstream/egress";
import type { PackedTransport } from "../../engine/adapter";
import { unescapeHtml } from "../../engine/text";
import { parseUpstreamError } from "../../errors";

const PROVIDER_ID = "microsoft-nmt-edge";
const ENDPOINT = "https://edge.microsoft.com/translate/translatetext";
const DEFAULT_EDGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0";
const EDGE_UA_PATTERN = /^Mozilla\/5\.0 \([a-zA-Z0-9_.;\-\s/]+\) AppleWebKit\/[0-9.]+ \(KHTML, like Gecko\) (Chrome\/[0-9.]+ )?(Mobile\/[a-zA-Z0-9]+ )?(Safari\/[0-9.]+ )?(Edg|EdgA|EdgiOS|Edge)\/[0-9.]+$/;
const EDGE_UA_TOKENS = ["Edg/", "EdgA/", "EdgiOS/"];
const TAG_PATTERN = /<[^>]+>/g;

interface MicrosoftResponseItem {
  detectedLanguage?: { language: string; score: number };
  translations?: { text: string; to: string }[];
}

export function resolveEdgeUserAgent(clientUserAgent: string | undefined): string {
  if (!clientUserAgent || clientUserAgent.length > 300) return DEFAULT_EDGE_UA;
  const candidate = clientUserAgent.trim();
  return EDGE_UA_PATTERN.test(candidate) && EDGE_UA_TOKENS.some((token) => candidate.includes(token)) ? candidate : DEFAULT_EDGE_UA;
}

async function callApi(payloads: string[], source: string, target: string, userAgent: string, signal: AbortSignal): Promise<MicrosoftResponseItem[]> {
  const url = new URL(ENDPOINT);
  if (source) url.searchParams.set("from", source);
  url.searchParams.set("to", target);
  url.searchParams.set("isEnterpriseClient", "false");
  const response = await egressBrowserFetch(url.toString(), {
    method: "POST",
    userAgent,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloads),
    signal,
  });
  if (!response.ok) throw parseUpstreamError(response.status, await response.text().catch(() => ""), PROVIDER_ID);
  return (await response.json()) as MicrosoftResponseItem[];
}

const toFlatText = (html: string | undefined): string | null => (html === undefined ? null : unescapeHtml(html.replace(TAG_PATTERN, "")));

export function createMicrosoftTransport(userAgent: string): PackedTransport {
  return {
    splitsOnFailure: false,
    async send(payloads, route, signal, onDetected) {
      const response = await callApi(payloads, route.source, route.target, userAgent, signal);
      const detected = response?.[0]?.detectedLanguage?.language;
      if (detected) onDetected?.(detected);
      return payloads.map((_, i) => toFlatText(response?.[i]?.translations?.[0]?.text));
    },
  };
}
