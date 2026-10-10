import { egressBrowserFetch } from "./egress";

const ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml";
const ORIGIN = "https://translate.google.com";
const LANGUAGE_CODE_PATTERN = /^[a-zA-Z]{2,3}(-[A-Za-z0-9]+)*$/;

export interface GooglePaRequest {
  key: string | null;
  texts: string[];
  source: string;
  target: string;
  userAgent: string;
  signal?: AbortSignal;
}

export const postGooglePa = ({ key, texts, source, target, userAgent, signal }: GooglePaRequest): Promise<Response> => {
  const url = new URL(ENDPOINT);
  const headers: Record<string, string> = { "Content-Type": "application/json+protobuf" };
  if (key) {
    url.searchParams.set("key", key);
    headers["X-Goog-Api-Key"] = key;
  }
  return egressBrowserFetch(url.toString(), {
    method: "POST",
    userAgent,
    origin: ORIGIN,
    secFetchSite: "cross-site",
    secFetchMode: "cors",
    secFetchDest: "empty",
    headers,
    body: JSON.stringify([[texts, source, target], "te"]),
    signal,
  });
};

export const isGooglePaAuthFailure = (status: number, body: string): boolean =>
  status === 401 || status === 403 || (status === 400 && (body.includes("API_KEY_INVALID") || body.includes("API key not valid")));

export const readGooglePaTranslation = (payload: unknown): string | null => {
  const text = Array.isArray(payload) ? (payload as { 0?: { 0?: unknown } })[0]?.[0] : undefined;
  return typeof text === "string" ? text : null;
};

export const readGooglePaDetectedLanguage = (payload: unknown): string | null => {
  const code = (payload as { 1?: { 0?: unknown } })?.[1]?.[0];
  return typeof code === "string" && LANGUAGE_CODE_PATTERN.test(code) ? code : null;
};
