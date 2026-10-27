import type { RequestContext } from "../http/context";
import { halt, proceed, type Outcome } from "../http/outcome";
import { reject, verificationRequired } from "../http/responses";
import { reportFault } from "../logging/fault";
import { trace } from "../logging/trace";
import type { Admission } from "./admission";
import { escalateOnLimiterTrip } from "./gate";
import { consumeRateLimit } from "./limiters";
import { consumeQuota, quotaHint, quotaResetAt } from "./quota";
import { consumeGlobalBudget } from "./reputation";

export interface MeteredWorkload {
  chars: number;
  cleared: boolean;
  clearanceMultiplier: number;
  plainVariant: boolean;
  enforceQuota: boolean;
}

export async function meterWorkload(rc: RequestContext, admission: Admission, workload: MeteredWorkload): Promise<Outcome<void>> {
  const { env, ctx } = rc;
  const { ipHash, now, gate } = admission;
  const { chars, cleared, clearanceMultiplier, plainVariant, enforceQuota } = workload;

  const withinRateLimit = await consumeRateLimit(env, ipHash, chars, { degraded: gate.degraded, clearanceMultiplier, plainVariant }).catch((error) => {
    reportFault("rate_limiter_unavailable", error, ipHash);
    return false;
  });
  if (!withinRateLimit) {
    escalateOnLimiterTrip(ctx, env, ipHash, now);
    trace(1, "security", "RATE_LIMITED", () => `Unit rate limit budget exceeded (processedChars: ${chars}, cleared: ${cleared})`, ipHash);
    return halt(reject(rc, { status: 429, body: { error: "rate_limited", trigger_turnstile: !cleared }, reason: "rate_limited", ipHash }));
  }

  const { verdict: quota, usage } = await consumeQuota(caches.default, ctx, { ipHash, chars, cleared, enforce: enforceQuota, now });
  if (quota === "verify") {
    trace(1, "security", "QUOTA_VERIFY_REQUIRED", () => `Soft usage quota reached (processedChars: ${chars})`, ipHash);
    return halt(verificationRequired(rc, "quota_verification_required", ipHash, quotaHint(usage)));
  }
  if (quota === "block") {
    if (!gate.quarantined) escalateOnLimiterTrip(ctx, env, ipHash, now);
    trace(1, "security", "QUOTA_EXCEEDED", () => `Hard usage quota reached (processedChars: ${chars}, cleared: ${cleared})`, ipHash);
    return halt(reject(rc, { status: 429, body: { error: "quota_exceeded", retry_at: quotaResetAt(usage) }, reason: "quota_exceeded", ipHash }));
  }

  if (!(await consumeGlobalBudget(env, now))) {
    trace(1, "security", "GLOBAL_BUDGET_EXCEEDED", "Global daily budget cap reached", ipHash);
    return halt(reject(rc, { status: 503, body: { error: "capacity_exceeded" }, reason: "capacity_exceeded", ipHash }));
  }
  return proceed(undefined);
}
