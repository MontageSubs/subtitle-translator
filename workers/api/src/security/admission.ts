import { halt, proceed, type Outcome } from "../http/outcome";
import type { RequestContext } from "../http/context";
import { verificationFailed, verificationRequired } from "../http/responses";
import { logSecurity } from "../logging/log";
import { escalateOnLimiterTrip, gateForRequest, type Gate } from "./gate";
import { clientIp, hashIp } from "./identity";
import { consumeBurst, consumeHandshakeLimit } from "./limiters";

export interface Admission {
  ip: string;
  ipHash: string;
  now: number;
  gate: Gate;
}

export async function admitRequest(rc: RequestContext, options: { enforceHandshakeLimit: boolean }): Promise<Outcome<Admission>> {
  const { env, ctx, request, path } = rc;
  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  const now = Date.now();

  const trip = (event: string, detail: string) => {
    escalateOnLimiterTrip(ctx, env, ipHash, now);
    logSecurity(event, ipHash, `${detail} on ${path} -> Escalating quarantine in D1 ip_shield`);
    return halt(verificationRequired(rc, detail, ipHash));
  };

  if (!(await consumeBurst(env, ipHash))) return trip("BURST_TRIPPED", "Burst trip");
  if (options.enforceHandshakeLimit && !(await consumeHandshakeLimit(env, ipHash))) return trip("HANDSHAKE_TRIPPED", "Handshake trip");

  const gate = await gateForRequest(env, request, ipHash, now);
  if (gate.blocked) {
    logSecurity("IP_BLOCKED", ipHash, "Blocked in D1 ip_shield");
    return halt(verificationFailed(rc, "Blocked IP", ipHash));
  }
  return proceed({ ip, ipHash, now, gate });
}

