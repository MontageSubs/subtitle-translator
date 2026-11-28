import type { RequestContext } from "../http/context";
import { halt, proceed, type Outcome } from "../http/outcome";
import { reject, verificationRequired } from "../http/responses";
import { reportFault } from "../logging/fault";
import { settingsFor } from "../config/settings";
import { trace } from "../logging/trace";
import type { Admission } from "./admission";
import { consumeRateLimit } from "./limiters";
import { consumeQuota, quotaHint, quotaPolicyFor, quotaResetAt, type QuotaPolicy, type QuotaUsage } from "./quota";

export interface MeteredWorkload {
  chars: number;
  cleared: boolean;
  clearanceMultiplier: number;
  plainVariant: boolean;
  enforceQuota: boolean;
}

function rejectExhaustedQuota(rc: RequestContext, { ipHash, ledger }: Admission, policy: QuotaPolicy, usage: QuotaUsage): Response {
  if (policy.onExhausted === "refuse") return reject(rc, { status: 429, body: { error: "allowance_exhausted" }, reason: "allowance_exhausted", ipHash });
  ledger.quarantine("quota_exceeded");
  return reject(rc, { status: 429, body: { error: "quota_exceeded", retry_at: quotaResetAt(policy, usage) }, reason: "quota_exceeded", ipHash });
}

export async function meterWorkload(rc: RequestContext, admission: Admission, workload: MeteredWorkload): Promise<Outcome<void>> {
  const { env, ctx } = rc;
  const { ipHash, ledger, gate } = admission;
  const { chars, cleared, clearanceMultiplier, plainVariant, enforceQuota } = workload;

  const withinRateLimit = await consumeRateLimit(env, ipHash, chars, { degraded: gate.degraded, clearanceMultiplier, plainVariant }).catch((error) => {
    reportFault("rate_limiter_unavailable", error, ipHash);
    return false;
  });
  if (!withinRateLimit) {
    ledger.quarantine("rate_limited");
    trace(1, "security", "RATE_LIMITED", () => `Unit rate limit budget exceeded (processedChars: ${chars}, cleared: ${cleared})`, ipHash);
    return halt(reject(rc, { status: 429, body: { error: "rate_limited", captcha_required: !cleared }, reason: "rate_limited", ipHash }));
  }

  const policy = quotaPolicyFor(settingsFor(env).quotaAllowance);
  const { verdict: quota, usage } = await consumeQuota(ctx, { policy, ipHash, chars, cleared, enforce: enforceQuota, now: rc.startedAt });
  if (quota === "verify") {
    trace(1, "security", "QUOTA_VERIFY_REQUIRED", () => `Soft usage quota reached (processedChars: ${chars})`, ipHash);
    return halt(verificationRequired(rc, "quota_verification_required", ipHash, quotaHint(policy, usage)));
  }
  if (quota === "block") {
    trace(1, "security", "QUOTA_EXCEEDED", () => `Hard usage quota reached (processedChars: ${chars}, cleared: ${cleared})`, ipHash);
    return halt(rejectExhaustedQuota(rc, admission, policy, usage));
  }

  if (!ledger.chargeBudget()) {
    trace(1, "security", "GLOBAL_BUDGET_EXCEEDED", "Global daily budget cap reached", ipHash);
    return halt(reject(rc, { status: 503, body: { error: "capacity_exceeded" }, reason: "capacity_exceeded", ipHash }));
  }
  return proceed(undefined);
}
