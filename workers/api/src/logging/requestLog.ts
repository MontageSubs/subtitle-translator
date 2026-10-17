import type { RequestContext } from "../http/context";
import { ipTag } from "./trace";

function record(rc: RequestContext, status: number, severe: boolean, detail: string, ipHash: string | undefined): void {
  if (rc.logged) return;
  rc.logged = true;
  const tag = ipTag(ipHash);
  (severe ? console.error : console.log)(`[http] ${rc.request.method} ${rc.path} -> ${status} (${Date.now() - rc.startedAt}ms${tag ? `, ipHash: ${tag}` : ""})${detail && ` - ${detail}`}`);
}

export const logRequest = (rc: RequestContext, status: number, detail = "", ipHash?: string): void => record(rc, status, status >= 500, detail, ipHash);

export const logRequestFailure = (rc: RequestContext, detail: string, ipHash?: string): void => record(rc, 200, true, detail, ipHash);
