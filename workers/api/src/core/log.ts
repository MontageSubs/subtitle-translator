export type BackendLogTag = "http" | "security" | "auth" | "db" | "cron" | "nmt" | "pipeline";

export function coreLog(namespace: string, message: string): void {
  console.log(`[${namespace}] ${message}`);
}

export function logHttp(method: string, path: string, status: number, durationMs: number, ipHash: string, detail?: string): void {
  const extra = detail ? ` - ${detail}` : "";
  console.log(`[http] ${method} ${path} -> ${status} (${durationMs}ms, ipHash: ${ipHash})${extra}`);
}

export function logSecurity(event: string, ipHash: string, detail?: string): void {
  const extra = detail ? ` (${detail})` : "";
  console.log(`[security] [${event}] ipHash: ${ipHash}${extra}`);
}

export function logAuth(event: string, ipHash: string, detail?: string): void {
  const extra = detail ? ` (${detail})` : "";
  console.log(`[auth] [${event}] ipHash: ${ipHash}${extra}`);
}

export function logDb(op: string, ipHash?: string, detail?: string): void {
  const target = ipHash ? ` (ipHash: ${ipHash})` : "";
  const extra = detail ? ` - ${detail}` : "";
  console.log(`[db] [${op}]${target}${extra}`);
}

export function logCron(task: string, detail: string): void {
  console.log(`[cron] [${task}] ${detail}`);
}
