import { settingsFor } from "../config/settings";
import { STANDBY_TTL_MS } from "../config/timing";
import { readJsonBody } from "../http/body";
import { rejectOutdatedClient } from "../http/clientVersion";
import type { RequestContext } from "../http/context";
import { jsonResponse, verificationRequired } from "../http/responses";
import { admitRequest } from "../security/admission";
import { generateRecipe } from "../security/clientCheck/recipe";
import { consumeHandshakeLimit } from "../security/limiters";
import { resolveSecretRing } from "../security/secretRing";
import { storeNonce } from "../security/session/nonce";
import { issueSession } from "../security/session/token";
import { verifyClearance } from "../security/turnstile";
import { logRequest } from "../logging/requestLog";
import { trace } from "../logging/trace";
import { capabilitiesFor } from "../translation/capabilities";

export async function handleHandshake(rc: RequestContext): Promise<Response> {
  const { env, request } = rc;
  const admission = await admitRequest(rc);
  if (!admission.ok) return admission.response;
  const { ip, ipHash, gate } = admission.value;

  const [body, ring, withinLimit] = await Promise.all([
    readJsonBody<{ clearance?: string; clientVersion?: string }>(request, settingsFor(env).maxBodyBytes),
    resolveSecretRing(env),
    consumeHandshakeLimit(env, ipHash),
  ]);
  const outdated = rejectOutdatedClient(rc, body?.clientVersion, ipHash);
  if (outdated) return outdated;

  if ((gate.requireClearance || !withinLimit) && !(await verifyClearance(ring, body?.clearance, ip))) {
    trace(1, "security", "TURNSTILE_REQUIRED", withinLimit ? "Clearance verification failed for handshake" : "Handshake limit exceeded, clearance required", ipHash);
    return verificationRequired(rc, "clearance_required", ipHash);
  }

  const recipe = generateRecipe();
  const { token, challengeKey, nonce } = await issueSession(ring, STANDBY_TTL_MS, recipe, ip);
  await storeNonce(caches.default, nonce, ipHash, ring.current, Math.ceil(STANDBY_TTL_MS / 1000));

  logRequest(rc, "ok", "", ipHash);
  return jsonResponse(rc, { token, challengeKey, nonce, recipe, worker_version: rc.workerVersion, capabilities: capabilitiesFor(env) }, 200);
}
