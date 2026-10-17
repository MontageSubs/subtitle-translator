import { halt, proceed, type Outcome } from "../http/outcome";
import type { RequestContext } from "../http/context";
import { accessBlocked, verificationFailed, verificationRequired } from "../http/responses";
import { trace } from "../logging/trace";
import { escalateOnLimiterTrip, gateForRequest, type Gate } from "./gate";
import { clientIp, hashIp } from "./identity";
import { consumeBurst } from "./limiters";

export interface Admission {
  ip: string;
  ipHash: string;
  now: number;
  gate: Gate;
}

export async function admitRequest(rc: RequestContext): Promise<Outcome<Admission>> {
  const { env, ctx, request, path } = rc;
  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  const now = Date.now();

  if (!(await consumeBurst(env, ipHash))) {
    escalateOnLimiterTrip(ctx, env, ipHash, now);
    trace(1, "security", "BURST_TRIPPED", () => `Burst trip on ${path} -> Escalating quarantine in D1 ip_shield`, ipHash);
    return halt(verificationRequired(rc, "Burst trip", ipHash));
  }

  const gate = await gateForRequest(env, request, ipHash, now);
  if (gate.blocked) {
    trace(1, "security", "IP_BLOCKED", "Blocked in D1 ip_shield", ipHash);
    return halt(gate.blockedUntil > now ? accessBlocked(rc, gate.blockedUntil, "Blocked IP", ipHash) : verificationFailed(rc, "Blocked IP", ipHash));
  }
  return proceed({ ip, ipHash, now, gate });
}

