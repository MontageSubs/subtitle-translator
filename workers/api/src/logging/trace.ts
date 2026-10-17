import { isDebugEnabled, type DebugThreshold } from "./level";

export type LogMessage = string | (() => string);

const IP_TAG_LENGTH = 7;
const SILENT_IP_HASHES: ReadonlySet<string | undefined> = new Set([undefined, "", "none", "unknown", "system"]);

export const resolveMessage = (message: LogMessage): string => (typeof message === "function" ? message() : message);

export function ipTag(ipHash: string | undefined): string | null {
  return SILENT_IP_HASHES.has(ipHash) ? null : ipHash!.slice(0, IP_TAG_LENGTH);
}

export function trace(threshold: DebugThreshold, scope: string, event: string, detail?: LogMessage, ipHash?: string): void {
  if (!isDebugEnabled(threshold)) return;
  const tag = ipTag(ipHash);
  const text = detail === undefined ? "" : resolveMessage(detail);
  console.log(`[${scope}] [${event}]${tag ? ` (ipHash: ${tag})` : ""}${text ? ` - ${text}` : ""}`);
}

export const logNotice = (scope: string, message: string): void => console.log(`[${scope}] ${message}`);
