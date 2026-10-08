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

function toHeaders(...sources: (EgressHeaders | undefined)[]): Headers {
  const headers = new Headers();
  for (const source of sources) if (source) for (const [key, value] of Object.entries(source)) headers.set(key, value);
  return headers;
}

export function egressFetch(url: string, request: EgressRequest = {}): Promise<Response> {
  return fetch(url, { method: request.method || "GET", headers: toHeaders(request.headers), body: request.body ?? undefined, signal: request.signal });
}

export function egressBrowserFetch(url: string, request: BrowserEgressRequest): Promise<Response> {
  const browserHeaders: EgressHeaders = {
    "User-Agent": request.userAgent,
    Accept: "*/*",
    "Accept-Language": request.acceptLanguage || "en-US,en;q=0.9",
  };
  if (request.origin) browserHeaders.Origin = request.origin;
  if (request.secFetchSite) browserHeaders["Sec-Fetch-Site"] = request.secFetchSite;
  if (request.secFetchMode) browserHeaders["Sec-Fetch-Mode"] = request.secFetchMode;
  if (request.secFetchDest) browserHeaders["Sec-Fetch-Dest"] = request.secFetchDest;
  return fetch(url, {
    method: request.method || "GET",
    headers: toHeaders(browserHeaders, request.headers),
    body: request.body ?? undefined,
    signal: request.signal,
  });
}
