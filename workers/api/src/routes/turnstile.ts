import { settingsFor } from "../config/settings";
import { readJsonBody } from "../http/body";
import { elapsedMs, type RequestContext } from "../http/context";
import { jsonResponse, reject } from "../http/responses";
import { clientIp, hashIp } from "../security/identity";
import { recordCaptchaSolved } from "../security/reputation";
import { resolveSecretRing } from "../security/secretRing";
import { issueClearance, verifyTurnstileToken } from "../security/turnstile";
import { errorMessage, logAuth, logDb, logHttp, logSecurity } from "../telemetry/log";

export async function handleTurnstile(rc: RequestContext): Promise<Response> {
  const { env, ctx, request } = rc;
  if (!env.TURNSTILE_SECRET_KEY) {
    logSecurity("TURNSTILE_MISCONFIGURED", "system", "TURNSTILE_SECRET_KEY missing");
    return jsonResponse(rc, { error: "turnstile not configured" }, 501);
  }
  const body = await readJsonBody<{ turnstileToken?: string }>(request, settingsFor(env).maxBodyBytes);
  if (!body?.turnstileToken) return reject(rc, { status: 400, body: { error: "missing turnstileToken" }, detail: "Missing turnstileToken" });

  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  if (!(await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip))) {
    logSecurity("TURNSTILE_VERIFY_FAILED", ipHash, "Cloudflare Turnstile token validation failed");
    return reject(rc, { status: 403, body: { error: "turnstile verification failed" }, detail: "Turnstile verify failed", ipHash });
  }

  ctx.waitUntil(
    recordCaptchaSolved(env, ipHash, Date.now())
      .then((escalated) => {
        logDb("RECORD_CAPTCHA_SOLVED", undefined, "Recorded Turnstile solution in D1 ip_shield");
        if (escalated) logSecurity("IP_ESCALATED", ipHash, "Daily captcha solve limit reached -> Escalating block duration in D1 ip_shield");
      })
      .catch((error) => logDb("D1_ERROR", undefined, `recordCaptchaSolved failed: ${errorMessage(error)}`))
  );

  const clearance = await issueClearance(await resolveSecretRing(env), ip);
  logAuth("CLEARANCE_ISSUED", undefined, "Issued Turnstile clearance token");
  logHttp("POST", rc.path, 200, elapsedMs(rc), undefined, "Clearance token issued successfully");
  return jsonResponse(rc, { clearance }, 200);
}
