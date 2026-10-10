import { egressBrowserFetch } from "./egress";

const ENDPOINT = "https://edge.microsoft.com/translate/translatetext";

export interface MicrosoftEdgeItem {
  detectedLanguage?: { language: string; score: number };
  translations?: { text: string; to: string }[];
}

export interface MicrosoftEdgeRequest {
  texts: string[];
  source: string;
  target: string;
  userAgent: string;
  signal?: AbortSignal;
}

export const postMicrosoftEdge = ({ texts, source, target, userAgent, signal }: MicrosoftEdgeRequest): Promise<Response> => {
  const url = new URL(ENDPOINT);
  if (source) url.searchParams.set("from", source);
  url.searchParams.set("to", target);
  url.searchParams.set("isEnterpriseClient", "false");
  return egressBrowserFetch(url.toString(), {
    method: "POST",
    userAgent,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(texts),
    signal,
  });
};

export const readMicrosoftEdgeTranslation = (item: MicrosoftEdgeItem | undefined): string | null => {
  const text = item?.translations?.[0]?.text;
  return typeof text === "string" ? text : null;
};
