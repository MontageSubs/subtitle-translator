import { settingsFor } from "../config/settings";
import { readJsonBody } from "../http/body";
import { noteClientVersion } from "../http/clientVersion";
import type { RequestContext } from "../http/context";
import { jsonResponse, reject } from "../http/responses";
import { clientIp, hashIp } from "../security/identity";
import { recordCaptchaSolved } from "../security/reputation";
import { resolveSecretRing } from "../security/secretRing";
import { issueClearance } from "../security/clearance";
import { verifyTurnstileToken } from "../security/turnstile";
import { reportFault } from "../logging/fault";
import { logRequest } from "../logging/requestLog";
import { trace } from "../logging/trace";

export async function handleClearance(rc: RequestContext): Promise<Response> {
  const { env, ctx, request } = rc;
  if (!env.TURNSTILE_SECRET) {
    logRequest(rc, "error", "status=501 reason=captcha_unconfigured");
    return jsonResponse(rc, { error: "captcha not configured" }, 501);
  }
  const body = await readJsonBody<{ captchaToken?: string; turnstileToken?: string; clientVersion?: string }>(request, settingsFor(env).maxBodyBytes);
  const captchaToken = body?.captchaToken ?? body?.turnstileToken;
  if (!body || !captchaToken) return reject(rc, { status: 400, body: { error: "missing captchaToken" }, reason: "captcha_token_missing" });
  noteClientVersion(rc, body.clientVersion);

  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  if (!(await verifyTurnstileToken(env.TURNSTILE_SECRET, captchaToken, ip))) {
    trace(1, "security", "CAPTCHA_VERIFY_FAILED", "Cloudflare Turnstile token validation failed", ipHash);
    return reject(rc, { status: 403, body: { error: "captcha verification failed" }, reason: "captcha_verification_failed", ipHash });
  }

  ctx.waitUntil(
    recordCaptchaSolved(env, ipHash, Date.now())
      .then((escalated) => {
        if (escalated) trace(1, "security", "IP_ESCALATED", "Daily captcha solve limit reached -> Escalating block duration in D1 ip_shield", ipHash);
      })
      .catch((error) => reportFault("captcha_record_failed", error, ipHash))
  );

  const clearance = await issueClearance(await resolveSecretRing(env), ip, settingsFor(env).clearanceTtlMs);
  logRequest(rc, "ok", "", ipHash);
  return jsonResponse(rc, { clearance }, 200);
}
