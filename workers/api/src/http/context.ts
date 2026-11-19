import type { Env } from "../config/env";
import type { ReputationLedger } from "../security/reputation/ledger";

export interface RequestContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  origin: string;
  path: string;
  endpoint: string;
  startedAt: number;
  logged: boolean;
  workerVersion: string;
  clientVersion: string;
  ledger: ReputationLedger | null;
  notes: string[];
}

export function createContext(request: Request, env: Env, ctx: ExecutionContext, workerVersion: string): RequestContext {
  const path = new URL(request.url).pathname;
  const startedAt = Date.now();
  return { request, env, ctx, origin: request.headers.get("Origin") || "", path, endpoint: "router", startedAt, logged: false, workerVersion, clientVersion: "", ledger: null, notes: [] };
}
