const IP_TAG_LENGTH = 7;

const SILENT_IP_TAGS: ReadonlySet<string | undefined> = new Set([undefined, "", "none", "unknown", "system"]);

function ipTag(ipHash: string | undefined): string | null {
  return SILENT_IP_TAGS.has(ipHash) ? null : ipHash!.slice(0, IP_TAG_LENGTH);
}

const suffix = (detail: string | undefined, wrap: (detail: string) => string): string => (detail ? wrap(detail) : "");

export function logHttp(method: string, path: string, status: number, durationMs: number, ipHash?: string, detail?: string): void {
  const tag = status >= 400 ? ipTag(ipHash) : null;
  console.log(`[http] ${method} ${path} -> ${status} (${durationMs}ms${tag ? `, ipHash: ${tag}` : ""})${suffix(detail, (d) => ` - ${d}`)}`);
}

export function logSecurity(event: string, ipHash?: string, detail?: string): void {
  const tag = ipTag(ipHash);
  console.log(`[security] [${event}]${tag ? ` ipHash: ${tag}` : ""}${suffix(detail, (d) => ` (${d})`)}`);
}

export function logAuth(event: string, ipHash?: string, detail?: string): void {
  const tag = ipTag(ipHash);
  console.log(`[auth] [${event}]${tag ? ` (ipHash: ${tag})` : ""}${suffix(detail, (d) => ` (${d})`)}`);
}

export function logDb(op: string, ipHash?: string, detail?: string): void {
  const tag = ipTag(ipHash);
  console.log(`[db] [${op}]${tag ? ` (ipHash: ${tag})` : ""}${suffix(detail, (d) => ` - ${d}`)}`);
}

export function logCron(task: string, detail: string): void {
  console.log(`[cron] [${task}] ${detail}`);
}

export function logEngine(namespace: string, message: string): void {
  console.log(`[${namespace}] ${message}`);
}

export function logDiagnostic(dim: "self" | "provider", code: number, attempt: number, isRetry: boolean, cueCount: number): void {
  console.log(JSON.stringify({ dim, code, attempt, isRetry, cueCount }));
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function reportError(label: string, error: unknown): void {
  console.error(`${label}: ${errorMessage(error)}`);
}
