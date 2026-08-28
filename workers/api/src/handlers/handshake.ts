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

export async function handleHandshake(request: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  const now = Date.now();

  if (!(await consumeBurst(env, ipHash))) {
    escalateOnBurstTrip(ctx, env, ipHash, now);
    logGate("burst_detected", ipHash, { path: "/handshake" });
    return json({ error: "verification_required", trigger_turnstile: true }, 429, origin, env);
  }

  const gate = await gateForRequest(env, request, ipHash, now);
  if (gate.blocked) {
    logGate("ip_blocked", ipHash);
    return json({ error: "verification_failed" }, 403, origin, env);
  }

  const body = await parseBody<{ clearance?: string }>(request, maxBodyBytes(env));
  const ring = await resolveSecretRing(env.WORKER_SECRET_A || "", env.WORKER_SECRET_B || "", env.WORKER_SALT || "");

  if (gate.requireClearance && !(await verifyClearance(ring, body?.clearance, ip))) {
    logGate("turnstile_triggered", ipHash, { reason: "handshake_abuse_or_quarantine" });
    return json({ error: "verification_required", trigger_turnstile: true }, 429, origin, env);
  }

  ctx.waitUntil(recordHandshake(env, env.DB, ipHash, now).catch((e) => logGate("d1_write_failed", ipHash, { op: "recordHandshake", message: String(e) })));

  const recipe = generateRecipe();
  const { token, challengeKey, nonce } = await issueSession(ring, STANDBY_TTL_MS, recipe, ip);
  
  const ttlSeconds = Math.ceil(STANDBY_TTL_MS / 1000);
  const secret = ring.current;
  await storeNonceInCache(caches.default, nonce, ip, secret, ttlSeconds);

  return json({ token, challengeKey, nonce, recipe }, 200, origin, env);
}
