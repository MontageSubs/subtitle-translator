export type EgressHeaders = Record<string, string>;

export interface EgressRequestOptions {
  method?: string;
  headers?: EgressHeaders;
  body?: BodyInit | null;
  signal?: AbortSignal;
}

function buildHeaders(base: EgressHeaders, extra?: EgressHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(base)) headers.set(key, value);
  if (extra) for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return headers;
}

export function egressFetch(url: string, options: EgressRequestOptions = {}): Promise<Response> {
  return fetch(url, {
    method: options.method || "GET",
    headers: buildHeaders({}, options.headers),
    body: options.body ?? undefined,
    signal: options.signal,
  });
}

export interface BrowserEgressOptions extends EgressRequestOptions {
  userAgent: string;
  origin?: string;
  secFetchSite?: string;
  secFetchMode?: string;
  secFetchDest?: string;
  acceptLanguage?: string;
}

export function egressBrowserFetch(url: string, options: BrowserEgressOptions): Promise<Response> {
  const base: EgressHeaders = {
    "User-Agent": options.userAgent,
    "Accept": "*/*",
    "Accept-Language": options.acceptLanguage || "en-US,en;q=0.9",
  };
  if (options.origin) base.Origin = options.origin;
  if (options.secFetchSite) base["Sec-Fetch-Site"] = options.secFetchSite;
  if (options.secFetchMode) base["Sec-Fetch-Mode"] = options.secFetchMode;
  if (options.secFetchDest) base["Sec-Fetch-Dest"] = options.secFetchDest;
  return fetch(url, {
    method: options.method || "GET",
    headers: buildHeaders(base, options.headers),
    body: options.body ?? undefined,
    signal: options.signal,
  });
}
