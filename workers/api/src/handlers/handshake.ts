import { Env, STANDBY_TTL_MS, maxBodyBytes, globalDailyBudget } from '../config/env';
import { issueSession } from '../security/token';
import { generateRecipe } from '../config/envProbe';
import { resolveSecretRing } from '../config/secret';
import { hashIp, clientIp } from '../security/identity';
import { json, parseBody, logGate } from '../http/response';
import { gateForRequest, consumeBurst, escalateOnBurstTrip } from '../security/gate';
import { verifyClearance } from '../security/turnstile';
import { consumeGlobalBudget, recordHandshake } from '../security/reputation';
import { storeNonceInCache } from '../security/nonce';
import { logHttp, logSecurity, logDb } from '../core/log';

export async function handleHandshake(request: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const startedAt = Date.now();
  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  const now = Date.now();

  if (!(await consumeBurst(env, ipHash))) {
    escalateOnBurstTrip(ctx, env, ipHash, now);
    logSecurity("BURST_TRIPPED", ipHash, "Exceeded rate limit on /handshake -> Escalating quarantine in D1 ip_shield");
    logHttp("POST", "/handshake", 429, Date.now() - startedAt, ipHash, "Burst trip");
    return json({ error: "verification_required", trigger_turnstile: true }, 429, origin, env);
  }

  const gate = await gateForRequest(env, request, ipHash, now);
  if (gate.blocked) {
    logSecurity("IP_BLOCKED", ipHash, "Blocked in D1 ip_shield");
    logHttp("POST", "/handshake", 403, Date.now() - startedAt, ipHash, "Blocked IP");
    return json({ error: "verification_failed" }, 403, origin, env);
  }

  const body = await parseBody<{ clearance?: string }>(request, maxBodyBytes(env));
  const ring = await resolveSecretRing(env.WORKER_SECRET_A || "", env.WORKER_SECRET_B || "", env.WORKER_SALT || "");

  if (gate.requireClearance && !(await verifyClearance(ring, body?.clearance, ip))) {
    logSecurity("TURNSTILE_REQUIRED", ipHash, "Clearance verification failed for handshake");
    logHttp("POST", "/handshake", 429, Date.now() - startedAt, ipHash, "Clearance required");
    return json({ error: "verification_required", trigger_turnstile: true }, 429, origin, env);
  }

  ctx.waitUntil(
    recordHandshake(env, env.DB, ipHash, now)
      .then(() => logDb("RECORD_HANDSHAKE", ipHash, "Recorded handshake window in D1 ip_shield"))
      .catch((e) => logDb("D1_ERROR", ipHash, `recordHandshake failed: ${e instanceof Error ? e.message : String(e)}`))
  );

  const recipe = generateRecipe();
  const { token, challengeKey, nonce } = await issueSession(ring, STANDBY_TTL_MS, recipe, ip);
  
  const ttlSeconds = Math.ceil(STANDBY_TTL_MS / 1000);
  const secret = ring.current;
  await storeNonceInCache(caches.default, nonce, ip, secret, ttlSeconds);

  logHttp("POST", "/handshake", 200, Date.now() - startedAt, ipHash, "Session issued successfully");
  return json({ token, challengeKey, nonce, recipe }, 200, origin, env);
}
