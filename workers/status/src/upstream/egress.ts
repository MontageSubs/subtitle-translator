import { SERVICE_USER_AGENT } from "./serviceUserAgent";

export type EgressHeaders = Record<string, string>;

export interface EgressRequest {
  method?: string;
  headers?: EgressHeaders;
  body?: BodyInit | null;
  signal?: AbortSignal;
}

export interface BrowserEgressRequest extends EgressRequest {
  userAgent: string;
  origin?: string;
  secFetchSite?: string;
  secFetchMode?: string;
  secFetchDest?: string;
  acceptLanguage?: string;
}

const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

const SERVICE_HEADERS: EgressHeaders = {
  "User-Agent": SERVICE_USER_AGENT,
  Accept: "*/*",
  "Accept-Language": DEFAULT_ACCEPT_LANGUAGE,
};

const send = (url: string, base: EgressHeaders, request: EgressRequest): Promise<Response> =>
  fetch(url, {
    method: request.method ?? "GET",
    headers: new Headers({ ...base, ...request.headers }),
    body: request.body ?? undefined,
    signal: request.signal,
  });

const browserHeaders = (request: BrowserEgressRequest): EgressHeaders => {
  const fetchMetadata: [string, string | undefined][] = [
    ["Origin", request.origin],
    ["Sec-Fetch-Site", request.secFetchSite],
    ["Sec-Fetch-Mode", request.secFetchMode],
    ["Sec-Fetch-Dest", request.secFetchDest],
  ];
  return {
    "User-Agent": request.userAgent,
    Accept: "*/*",
    "Accept-Language": request.acceptLanguage ?? DEFAULT_ACCEPT_LANGUAGE,
    ...Object.fromEntries(fetchMetadata.filter((entry): entry is [string, string] => Boolean(entry[1]))),
  };
};

export const egressFetch = (url: string, request: EgressRequest = {}): Promise<Response> => send(url, SERVICE_HEADERS, request);

export const egressBrowserFetch = (url: string, request: BrowserEgressRequest): Promise<Response> =>
  send(url, browserHeaders(request), request);
