import type { RequestContext } from "../http/context";
import { writeLine } from "./line";
import { ipTag } from "./trace";

type Outcome = "ok" | "rejected" | "failed" | "error";

const LEVELS = { ok: "log", rejected: "warn", failed: "error", error: "error" } as const;

export function logRequest(rc: RequestContext, outcome: Outcome, fields = "", ipHash?: string): void {
  if (rc.logged) return;
  rc.logged = true;
  const tag = ipTag(ipHash);
  writeLine(LEVELS[outcome], rc.endpoint, outcome, `${tag ? `ip=${tag} ` : ""}ms=${Date.now() - rc.startedAt}${fields && ` ${fields}`}`);
}
