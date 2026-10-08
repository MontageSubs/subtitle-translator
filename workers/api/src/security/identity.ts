import type { Env } from "../config/env";
import { hmacHex } from "./crypto";

export class MissingClientIpError extends Error {
  constructor() {
    super("missing_client_ip");
    this.name = "MissingClientIpError";
  }
}

export const hashIp = (env: Env, ip: string): Promise<string> => hmacHex(env.IP_HASH_SALT, ip);

export function clientIp(request: Request): string {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) throw new MissingClientIpError();
  return ip;
}
