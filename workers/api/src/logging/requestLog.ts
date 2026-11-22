import type { RequestContext } from "../http/context";
import { writeLine } from "./line";
import { ipTag } from "./trace";

type Outcome = "ok" | "rejected" | "failed" | "error" | "canceled";
type LogLevel = "log" | "warn" | "error";

const LEVELS: Record<Outcome, LogLevel> = { ok: "log", rejected: "warn", failed: "error", error: "error", canceled: "warn" };

export function logRequest(rc: RequestContext, outcome: Outcome, fields = "", ipHash?: string, level: LogLevel = LEVELS[outcome]): void {
  if (rc.logged) return;
  rc.logged = true;
  const tag = ipTag(ipHash);
  const parts = [tag && `ip=${tag}`, rc.clientVersion && `client=${rc.clientVersion}`, rc.lastStatus && `last=${rc.lastStatus}`, fields, ...rc.notes].filter(Boolean);
  writeLine(rc.notes.length && level === "log" ? "warn" : level, rc.endpoint, outcome, parts.join(" "));
}
