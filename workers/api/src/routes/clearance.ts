import { settingsFor } from "../config/settings";
import { readJsonBody } from "../http/body";
import { readClientReport } from "../http/clientReport";
import type { RequestContext } from "../http/context";
import { invalidRequest, jsonResponse, reject } from "../http/responses";
import { identifyClient } from "../security/identity";
import { resolveSecretRing } from "../security/secretRing";
import { issueSession } from "../security/session";
import { issueClearance } from "../security/clearance";
import { verifyTurnstileToken } from "../security/turnstile";
import { logRequest } from "../logging/requestLog";
import { trace } from "../logging/trace";

export async function handleClearance(rc: RequestContext): Promise<Response> {
  const { env, ctx, request } = rc;
  if (!env.CAPTCHA_SECRET) {
    logRequest(rc, "error", "status=501 reason=captcha_unconfigured");
    return jsonResponse(rc, { error: "captcha not configured" }, 501);
  }
  const body = await readJsonBody<{ captchaToken?: string; clientVersion?: string; ls?: unknown }>(request, settingsFor(env).maxBodyBytes);
  const captchaToken = body?.captchaToken;
  if (!body || !captchaToken) return reject(rc, { status: 400, body: { error: "missing captchaToken" }, reason: "captcha_token_missing" });
  if (!readClientReport(rc, body)) return invalidRequest(rc, "last_status_invalid");

  const { ip, ipHash, ledger } = await identifyClient(rc);
  if (!(await verifyTurnstileToken(env.CAPTCHA_SECRET, captchaToken, ip))) {
    trace(1, "security", "CAPTCHA_VERIFY_FAILED", "Cloudflare Turnstile token validation failed", ipHash);
    return reject(rc, { status: 403, body: { error: "captcha verification failed" }, reason: "captcha_verification_failed", ipHash });
  }

  ledger.applyInBackground(ctx, () => ledger.recordCaptchaSolved());

  const ring = await resolveSecretRing(env);
  const [clearance, session] = await Promise.all([
    issueClearance(ring, ip, settingsFor(env).clearanceTtlMs),
    issueSession(ring, settingsFor(env).standbyTtlMs, ip),
  ]);
  logRequest(rc, "ok", "", ipHash);
  return jsonResponse(rc, { clearance, ...session }, 200);
}
