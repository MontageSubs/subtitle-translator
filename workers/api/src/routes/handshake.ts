import { settingsFor } from "../config/settings";
import { STANDBY_TTL_MS } from "../config/timing";
import { readJsonBody } from "../http/body";
import type { RequestContext } from "../http/context";
import { elapsedMs } from "../http/context";
import { jsonResponse, verificationRequired } from "../http/responses";
import { admitRequest } from "../security/admission";
import { generateRecipe } from "../security/clientCheck/recipe";
import { resolveSecretRing } from "../security/secretRing";
import { storeNonce } from "../security/session/nonce";
import { issueSession } from "../security/session/token";
import { verifyClearance } from "../security/turnstile";
import { logAuth, logHttp, logSecurity } from "../logging/log";

export async function handleHandshake(rc: RequestContext): Promise<Response> {
  const { env, request } = rc;
  const admission = await admitRequest(rc, { enforceHandshakeLimit: true });
  if (!admission.ok) return admission.response;
  const { ip, ipHash, gate } = admission.value;

  const [body, ring] = await Promise.all([readJsonBody<{ clearance?: string }>(request, settingsFor(env).maxBodyBytes), resolveSecretRing(env)]);
  if (gate.requireClearance && !(await verifyClearance(ring, body?.clearance, ip))) {
    logSecurity("TURNSTILE_REQUIRED", ipHash, "Clearance verification failed for handshake");
    return verificationRequired(rc, "Clearance required", ipHash);
  }

  const recipe = generateRecipe();
  const { token, challengeKey, nonce } = await issueSession(ring, STANDBY_TTL_MS, recipe, ip);
  await storeNonce(caches.default, nonce, ipHash, ring.current, Math.ceil(STANDBY_TTL_MS / 1000));

  logAuth("SESSION_ISSUED", undefined, `Standby token issued (nonce: ${nonce}, tag: ${recipe.tag})`);
  logHttp("POST", rc.path, 200, elapsedMs(rc), undefined, "Session issued successfully");
  return jsonResponse(rc, { token, challengeKey, nonce, recipe, worker_version: rc.workerVersion }, 200);
}
