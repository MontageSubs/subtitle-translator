import { SERVICE_USER_AGENT } from "./userAgents";

export type EgressHeaders = Record<string, string>;

export interface EgressRequestOptions {
  method?: string;
  headers?: EgressHeaders;
  body?: BodyInit | null;
  signal?: AbortSignal;
}

export interface BrowserEgressOptions extends EgressRequestOptions {
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
  "Accept": "*/*",
  "Accept-Language": DEFAULT_ACCEPT_LANGUAGE,
  "Accept-Encoding": "identity",
};

function mergeHeaders(base: EgressHeaders, overrides?: EgressHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) headers.set(key, value);
  return headers;
}

function send(url: string, baseHeaders: EgressHeaders, options: EgressRequestOptions): Promise<Response> {
  return fetch(url, {
    method: options.method || "GET",
    headers: mergeHeaders(baseHeaders, options.headers),
    body: options.body ?? undefined,
    signal: options.signal,
  });
}

function browserHeaders(options: BrowserEgressOptions): EgressHeaders {
  const optional: Array<[string, string | undefined]> = [
    ["Origin", options.origin],
    ["Sec-Fetch-Site", options.secFetchSite],
    ["Sec-Fetch-Mode", options.secFetchMode],
    ["Sec-Fetch-Dest", options.secFetchDest],
  ];
  return {
    "User-Agent": options.userAgent,
    "Accept": "*/*",
    "Accept-Language": options.acceptLanguage || DEFAULT_ACCEPT_LANGUAGE,
    ...Object.fromEntries(optional.filter((entry): entry is [string, string] => Boolean(entry[1]))),
  };
}

export const egressFetch = (url: string, options: EgressRequestOptions = {}): Promise<Response> =>
  send(url, SERVICE_HEADERS, options);

export const egressBrowserFetch = (url: string, options: BrowserEgressOptions): Promise<Response> =>
  send(url, browserHeaders(options), options);
