export type LogLevel = "INFO" | "WARN" | "ERROR";

export function getLocalTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export function formatFrontendLog(rawMessage: string): string | null {
  const trimmed = rawMessage.trim();
  if (!trimmed) return null;

  if (
    /handshaking|preparing translation request|sending request to worker stream|request stream completed|token:|clearance:/i.test(trimmed)
  ) {
    return null;
  }

  const timestamp = getLocalTimestamp();

  if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s+\[(INFO|WARN|ERROR)\]\s+\[[a-zA-Z0-9_-]+\]\s+/.test(trimmed)) {
    return trimmed.replace(/^\d{2}:\d{2}:\d{2}\.\d{3}/, timestamp);
  }

  let level: LogLevel = "INFO";
  let process = "Engine";
  let content = trimmed;

  if (/failed to merge|missing cue|split error|error|failed|unable|invalid/i.test(trimmed)) {
    level = /failed to merge|missing cue|recovered/i.test(trimmed) ? "WARN" : "ERROR";
  }

  if (/recovered|split|merge/i.test(trimmed)) {
    process = "Pipeline";
    content = content.charAt(0).toUpperCase() + content.slice(1);
  } else if (/retry|retrying/i.test(trimmed)) {
    process = "Retry";
    content = content.charAt(0).toUpperCase() + content.slice(1);
  } else if (/NMT:|Translating|batch/i.test(trimmed)) {
    process = "Engine";
  } else if (/offline|network|connect|disconnect/i.test(trimmed)) {
    process = "Network";
    level = "ERROR";
  } else if (/completed|success|finished/i.test(trimmed)) {
    process = "Job";
  }

  return `${timestamp} [${level}] [${process}] ${content}`;
}

export function createFrontendLog(level: LogLevel, process: string, message: string): string {
  return `${getLocalTimestamp()} [${level}] [${process}] ${message}`;
}
