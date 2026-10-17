import type { Env } from "../config/env";
import { RequestLog } from "../logging/requestLog";

export interface RequestContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  origin: string;
  path: string;
  startedAt: number;
  log: RequestLog;
  workerVersion: string;
}

export function createContext(request: Request, env: Env, ctx: ExecutionContext, workerVersion: string): RequestContext {
  const path = new URL(request.url).pathname;
  const startedAt = Date.now();
  return { request, env, ctx, origin: request.headers.get("Origin") || "", path, startedAt, log: new RequestLog(request.method, path, startedAt), workerVersion };
}
