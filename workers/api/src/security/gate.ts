import type { Env } from "../config/env";
import { settingsFor } from "../config/settings";
import { errorMessage, logSecurity } from "../logging/log";
import { FAIL_CLOSED_GATE, checkGate, escalateQuarantine, recordMalformedRequest, type Gate } from "./reputation";

export type { Gate } from "./reputation";

function isFromRiskyAsn(env: Env, request: Request): boolean {
  const asn = (request as Request & { cf?: { asn?: number } }).cf?.asn;
  return typeof asn === "number" && settingsFor(env).riskyAsns.has(asn);
}

export async function gateForRequest(env: Env, request: Request, ipHash: string, now: number): Promise<Gate> {
  try {
    const gate = await checkGate(env, ipHash, now);
    return isFromRiskyAsn(env, request) ? { ...gate, requireClearance: true } : gate;
  } catch (error) {
    logSecurity("D1_READ_FAILED_FAILCLOSED", ipHash, errorMessage(error));
    return FAIL_CLOSED_GATE;
  }
}

export function escalateOnLimiterTrip(ctx: ExecutionContext, env: Env, ipHash: string, now: number): void {
  ctx.waitUntil(escalateQuarantine(env, ipHash, now).catch((error) => logSecurity("D1_WRITE_FAILED", ipHash, `escalateQuarantine: ${errorMessage(error)}`)));
}

export function flagMalformedRequest(ctx: ExecutionContext, env: Env, ipHash: string, now: number): void {
  ctx.waitUntil(
    recordMalformedRequest(env, ipHash, now)
      .then((escalated) => {
        if (escalated) logSecurity("IP_ESCALATED", ipHash, "reason: malformed_request_threshold");
      })
      .catch((error) => logSecurity("D1_WRITE_FAILED", ipHash, `recordMalformedRequest: ${errorMessage(error)}`))
  );
}
