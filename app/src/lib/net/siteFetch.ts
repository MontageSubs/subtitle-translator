export function siteFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, mode: "cors", credentials: "omit", redirect: "follow" });
}
