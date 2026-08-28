export type ClientLogLevel = "INFO" | "WARN" | "ERROR";
export type ClientLogCategory = "http" | "nmt" | "pipeline" | "retry" | "auth" | "app";

export function getLocalTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export function formatClientLog(level: ClientLogLevel, category: ClientLogCategory, message: string): string {
  return `${getLocalTimestamp()} [${level}] [${category}] ${message}`;
}

export function formatServerStreamLog(rawMessage: string): string {
  const trimmed = rawMessage.trim();
  if (!trimmed) return "";

  if (/^\[\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return trimmed;
  }

  if (/^\[(INFO|WARN|ERROR)\]/.test(trimmed)) {
    return `${getLocalTimestamp()} ${trimmed}`;
  }

  let level: ClientLogLevel = "INFO";
  let category: ClientLogCategory = "nmt";

  if (/fail|error|unable|invalid/i.test(trimmed)) {
    level = "WARN";
  }

  if (/recovered|splits|merge/i.test(trimmed)) {
    category = "pipeline";
  } else if (/retry|retrying/i.test(trimmed)) {
    category = "retry";
  } else if (/handshake|request|stream|token/i.test(trimmed)) {
    category = "http";
  }

  return `${getLocalTimestamp()} [${level}] [${category}] ${trimmed}`;
}
