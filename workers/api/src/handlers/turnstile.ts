import { Env, maxBodyBytes } from '../config/env';
import { verifyTurnstileToken, issueClearance } from '../security/turnstile';
import { recordCaptchaSolved } from '../security/reputation';
import { resolveSecretRing } from '../config/secret';
import { hashIp, clientIp } from '../security/identity';
import { json, parseBody } from '../http/response';
import { logHttp, logSecurity, logAuth, logDb } from '../core/log';

export async function handleTurnstile(request: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const startedAt = Date.now();
  if (!env.TURNSTILE_SECRET_KEY) {
    logSecurity("TURNSTILE_MISCONFIGURED", "system", "TURNSTILE_SECRET_KEY missing");
    return json({ error: "turnstile not configured" }, 501, origin, env);
  }
  const body = await parseBody<{ turnstileToken?: string }>(request, maxBodyBytes(env));
  if (!body?.turnstileToken) {
    logHttp("POST", "/turnstile", 400, Date.now() - startedAt, "unknown", "Missing turnstileToken");
    return json({ error: "missing turnstileToken" }, 400, origin, env);
  }
  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  const ok = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip);
  if (!ok) {
    logSecurity("TURNSTILE_VERIFY_FAILED", ipHash, "Cloudflare Turnstile token validation failed");
    logHttp("POST", "/turnstile", 403, Date.now() - startedAt, ipHash, "Turnstile verify failed");
    return json({ error: "turnstile verification failed" }, 403, origin, env);
  }
  ctx.waitUntil(
    recordCaptchaSolved(env, env.DB, ipHash, Date.now())
      .then((escalated) => {
        logDb("RECORD_CAPTCHA_SOLVED", undefined, "Recorded Turnstile solution in D1 ip_shield");
        if (escalated) logSecurity("IP_ESCALATED", ipHash, "Daily captcha solve limit reached -> Escalating block duration in D1 ip_shield");
      })
      .catch((e) => logDb("D1_ERROR", undefined, `recordCaptchaSolved failed: ${e instanceof Error ? e.message : String(e)}`))
  );
  const ring = await resolveSecretRing(env.WORKER_SECRET_A || "", env.WORKER_SECRET_B || "", env.WORKER_SALT || "");
  const clearance = await issueClearance(ring, ip);
  logAuth("CLEARANCE_ISSUED", undefined, `Issued Turnstile clearance token (clearance: ${clearance.slice(0, 16)}...)`);
  logHttp("POST", "/turnstile", 200, Date.now() - startedAt, undefined, "Clearance token issued successfully");
  return json({ clearance }, 200, origin, env);
}
