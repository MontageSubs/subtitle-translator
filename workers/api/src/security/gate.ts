import type { Env } from "../config/env";
import { settingsFor } from "../config/settings";
import { reportFault } from "../logging/fault";
import { trace } from "../logging/trace";
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
    reportFault("gate_read_failed", error, ipHash);
    return FAIL_CLOSED_GATE;
  }
}

export function escalateOnLimiterTrip(ctx: ExecutionContext, env: Env, ipHash: string, now: number): void {
  ctx.waitUntil(escalateQuarantine(env, ipHash, now).catch((error) => reportFault("quarantine_escalation_failed", error, ipHash)));
}

export function flagMalformedRequest(ctx: ExecutionContext, env: Env, ipHash: string, now: number): void {
  ctx.waitUntil(
    recordMalformedRequest(env, ipHash, now)
      .then((escalated) => {
        if (escalated) trace(1, "security", "IP_ESCALATED", "reason: malformed_request_threshold", ipHash);
      })
      .catch((error) => reportFault("malformed_flag_failed", error, ipHash))
  );
}
