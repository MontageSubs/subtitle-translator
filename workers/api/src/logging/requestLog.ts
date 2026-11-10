import type { RequestContext } from "../http/context";
import { writeLine } from "./line";
import { ipTag } from "./trace";

type Outcome = "ok" | "rejected" | "failed" | "error" | "canceled";

const LEVELS = { ok: "log", rejected: "warn", failed: "error", error: "error", canceled: "warn" } as const;

export function logRequest(rc: RequestContext, outcome: Outcome, fields = "", ipHash?: string, level: (typeof LEVELS)[Outcome] = LEVELS[outcome]): void {
  if (rc.logged) return;
  rc.logged = true;
  const tag = ipTag(ipHash);
  const client = rc.clientVersion && ` client=${rc.clientVersion}`;
  writeLine(level, rc.endpoint, outcome, `${tag ? `ip=${tag}` : ""}${client}${fields && ` ${fields}`}`.trimStart());
}
