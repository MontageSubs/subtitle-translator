import { Env, STANDBY_TTL_MS, maxBodyBytes, globalDailyBudget } from "../env";
import { issueSession } from "../token";
import { generateRecipe } from "../envProbe";
import { resolveSecretRing } from "../secret";
import { hashIp, clientIp } from "../identity";
import { json, parseBody, logGate } from "../response";
import { gateForRequest, consumeBurst, escalateOnBurstTrip } from "../gate";
import { verifyClearance } from "../turnstile";
import { consumeGlobalBudget, recordHandshake } from "../reputation";
import { loadStats } from "../stats";

export async function handleHandshake(request: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const ipHash = await hashIp(env, clientIp(request));
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

  if (!(await consumeGlobalBudget(env.DB, now, globalDailyBudget(env)))) {
    logGate("global_budget_exceeded", ipHash);
    return json({ error: "capacity_exceeded" }, 503, origin, env);
  }

  const body = await parseBody<{ clearance?: string }>(request, maxBodyBytes(env));
  const ring = await resolveSecretRing(env.WORKER_SECRET_A || "", env.WORKER_SECRET_B || "", env.WORKER_SALT || "");

  if (gate.requireClearance && !(await verifyClearance(ring, body?.clearance))) {
    logGate("turnstile_triggered", ipHash, { reason: "handshake_abuse_or_quarantine" });
    return json({ error: "verification_required", trigger_turnstile: true }, 429, origin, env);
  }

  ctx.waitUntil(recordHandshake(env, env.DB, ipHash, now).catch((e) => logGate("d1_write_failed", ipHash, { op: "recordHandshake", message: String(e) })));

  const recipe = generateRecipe();
  const [{ token, challengeKey, nonce }, stats] = await Promise.all([issueSession(ring, STANDBY_TTL_MS, recipe), loadStats(env)]);
  return json({ token, challengeKey, nonce, recipe, stats }, 200, origin, env);
}
