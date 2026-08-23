import { Env, maxBodyBytes } from "../env";
import { verifyTurnstileToken, issueClearance } from "../turnstile";
import { recordCaptchaSolved } from "../reputation";
import { resolveSecretRing } from "../secret";
import { hashIp, clientIp } from "../identity";
import { json, parseBody, logGate } from "../response";

export async function handleTurnstile(request: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  if (!env.TURNSTILE_SECRET_KEY) return json({ error: "turnstile not configured" }, 501, origin, env);
  const body = await parseBody<{ turnstileToken?: string }>(request, maxBodyBytes(env));
  if (!body?.turnstileToken) return json({ error: "missing turnstileToken" }, 400, origin, env);
  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  const ok = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip);
  if (!ok) {
    logGate("turnstile_verify_failed", ipHash);
    return json({ error: "turnstile verification failed" }, 403, origin, env);
  }
  ctx.waitUntil(
    recordCaptchaSolved(env.DB, ipHash, Date.now())
      .then((escalated) => { if (escalated) logGate("ip_escalated", ipHash, { reason: "daily_captcha_cap" }); })
      .catch((e) => logGate("d1_write_failed", ipHash, { op: "recordCaptchaSolved", message: String(e) }))
  );
  const ring = await resolveSecretRing(env.WORKER_SECRET, env.WORKER_SALT || "");
  const clearance = await issueClearance(ring);
  return json({ clearance }, 200, origin, env);
}
