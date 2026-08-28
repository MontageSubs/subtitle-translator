export type BackendLogTag = "http" | "security" | "auth" | "db" | "cron" | "nmt" | "pipeline";

export function formatIpHash(ipHash?: string): string {
  if (!ipHash) return "none";
  if (ipHash.length <= 7) return ipHash;
  return ipHash.slice(0, 7);
}

export function coreLog(namespace: string, message: string): void {
  console.log(`[${namespace}] ${message}`);
}

export function logHttp(method: string, path: string, status: number, durationMs: number, ipHash: string, detail?: string): void {
  const extra = detail ? ` - ${detail}` : "";
  console.log(`[http] ${method} ${path} -> ${status} (${durationMs}ms, ipHash: ${formatIpHash(ipHash)})${extra}`);
}

export function logSecurity(event: string, ipHash: string, detail?: string): void {
  const extra = detail ? ` (${detail})` : "";
  console.log(`[security] [${event}] ipHash: ${formatIpHash(ipHash)}${extra}`);
}

export function logAuth(event: string, ipHash: string, detail?: string): void {
  const extra = detail ? ` (${detail})` : "";
  console.log(`[auth] [${event}] ipHash: ${formatIpHash(ipHash)}${extra}`);
}

export function logDb(op: string, ipHash?: string, detail?: string): void {
  const target = ipHash ? ` (ipHash: ${formatIpHash(ipHash)})` : "";
  const extra = detail ? ` - ${detail}` : "";
  console.log(`[db] [${op}]${target}${extra}`);
}

export function logCron(task: string, detail: string): void {
  console.log(`[cron] [${task}] ${detail}`);
}

export function logNmt(engine: string, message: string, detail?: string): void {
  const extra = detail ? ` - ${detail}` : "";
  console.log(`[nmt] [${engine}] ${message}${extra}`);
}
