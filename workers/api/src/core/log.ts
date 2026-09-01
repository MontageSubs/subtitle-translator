export type BackendLogTag = "http" | "security" | "auth" | "db" | "cron" | "nmt" | "pipeline";

export function formatIpHash(ipHash?: string): string {
  if (!ipHash || ipHash === "none" || ipHash === "unknown" || ipHash === "system") return "none";
  if (ipHash.length <= 7) return ipHash;
  return ipHash.slice(0, 7);
}

export function coreLog(namespace: string, message: string): void {
  console.log(`[${namespace}] ${message}`);
}

export function logHttp(method: string, path: string, status: number, durationMs: number, ipHash?: string, detail?: string): void {
  const extra = detail ? ` - ${detail}` : "";
  const formattedIp = formatIpHash(ipHash);
  const showIp = status >= 400 && formattedIp !== "none";
  const ipTag = showIp ? `, ipHash: ${formattedIp}` : "";
  console.log(`[http] ${method} ${path} -> ${status} (${durationMs}ms${ipTag})${extra}`);
}

export function logSecurity(event: string, ipHash?: string, detail?: string): void {
  const extra = detail ? ` (${detail})` : "";
  const formattedIp = formatIpHash(ipHash);
  const ipTag = formattedIp !== "none" ? ` ipHash: ${formattedIp}` : "";
  console.log(`[security] [${event}]${ipTag}${extra}`);
}

export function logAuth(event: string, ipHash?: string, detail?: string): void {
  const extra = detail ? ` (${detail})` : "";
  const formattedIp = formatIpHash(ipHash);
  const ipTag = formattedIp !== "none" ? ` (ipHash: ${formattedIp})` : "";
  console.log(`[auth] [${event}]${ipTag}${extra}`);
}

export function logDb(op: string, ipHash?: string, detail?: string): void {
  const formattedIp = formatIpHash(ipHash);
  const target = formattedIp !== "none" ? ` (ipHash: ${formattedIp})` : "";
  const extra = detail ? ` - ${detail}` : "";
  console.log(`[db] [${op}]${target}${extra}`);
}

export function logCron(task: string, detail: string): void {
  console.log(`[cron] [${task}] ${detail}`);
}

