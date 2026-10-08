import type { Env } from "../config/env";

export interface RequestContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  origin: string;
  path: string;
  startedAt: number;
  workerVersion: string;
}

export function createContext(request: Request, env: Env, ctx: ExecutionContext, workerVersion: string): RequestContext {
  return { request, env, ctx, origin: request.headers.get("Origin") || "", path: new URL(request.url).pathname, startedAt: Date.now(), workerVersion };
}

export const elapsedMs = (rc: RequestContext): number => Date.now() - rc.startedAt;
