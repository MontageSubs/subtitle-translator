import type { Env } from "../config/env";

export interface RequestContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  origin: string;
  path: string;
  startedAt: number;
  logged: boolean;
  workerVersion: string;
}

export function createContext(request: Request, env: Env, ctx: ExecutionContext, workerVersion: string): RequestContext {
  const path = new URL(request.url).pathname;
  const startedAt = Date.now();
  return { request, env, ctx, origin: request.headers.get("Origin") || "", path, startedAt, logged: false, workerVersion };
}
