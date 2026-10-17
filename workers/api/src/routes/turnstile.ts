import { settingsFor } from "../config/settings";
import { readJsonBody } from "../http/body";
import type { RequestContext } from "../http/context";
import { jsonResponse, reject } from "../http/responses";
import { clientIp, hashIp } from "../security/identity";
import { recordCaptchaSolved } from "../security/reputation";
import { resolveSecretRing } from "../security/secretRing";
import { issueClearance, verifyTurnstileToken } from "../security/turnstile";
import { reportFault } from "../logging/fault";
import { ipTag, trace } from "../logging/trace";

export async function handleTurnstile(rc: RequestContext): Promise<Response> {
  const { env, ctx, request } = rc;
  if (!env.TURNSTILE_SECRET_KEY) {
    rc.log.settle({ status: 501, detail: "TURNSTILE_SECRET_KEY missing" });
    return jsonResponse(rc, { error: "turnstile not configured" }, 501);
  }
  const body = await readJsonBody<{ turnstileToken?: string }>(request, settingsFor(env).maxBodyBytes);
  if (!body?.turnstileToken) return reject(rc, { status: 400, body: { error: "missing turnstileToken" }, detail: "Missing turnstileToken" });

  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  if (!(await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip))) {
    trace(1, "security", "TURNSTILE_VERIFY_FAILED", "Cloudflare Turnstile token validation failed", ipHash);
    return reject(rc, { status: 403, body: { error: "turnstile verification failed" }, detail: "Turnstile verify failed", ipHash });
  }

  ctx.waitUntil(
    recordCaptchaSolved(env, ipHash, Date.now())
      .then((escalated) => {
        trace(1, "db", "RECORD_CAPTCHA_SOLVED", "Recorded Turnstile solution in D1 ip_shield");
        if (escalated) trace(1, "security", "IP_ESCALATED", "Daily captcha solve limit reached -> Escalating block duration in D1 ip_shield", ipHash);
      })
      .catch((error) => reportFault("recordCaptchaSolved failed", error, ipTag(ipHash)))
  );

  const clearance = await issueClearance(await resolveSecretRing(env), ip);
  trace(1, "auth", "CLEARANCE_ISSUED", "Issued Turnstile clearance token");
  rc.log.settle({ status: 200, detail: "Clearance token issued" });
  return jsonResponse(rc, { clearance }, 200);
}
