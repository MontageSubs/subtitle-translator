import { reportNetworkFailure } from "./serviceReachability";

export function siteFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, mode: "cors", credentials: "omit", redirect: "follow" }).catch((error: unknown) => {
    reportNetworkFailure(url, error);
    throw error;
  });
}
