import { hmacHex } from "./crypto";
import { Env } from '../config/env';

export async function hashIp(env: Env, ip: string): Promise<string> {
  return hmacHex(env.IP_HASH_SALT, ip);
}

export function clientIp(request: Request): string {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) throw new Error("missing_client_ip");
  return ip;
}
