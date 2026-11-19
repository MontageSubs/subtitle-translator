import { settingsFor } from "../config/settings";
import { readJsonBody } from "../http/body";
import type { RequestContext } from "../http/context";
import { jsonResponse, verificationRequired } from "../http/responses";
import { admitRequest } from "../security/admission";
import { admitSealedClient } from "../security/clientSeal";
import { consumeSessionLimit } from "../security/limiters";
import { resolveSecretRing } from "../security/secretRing";
import { issueSession } from "../security/session/token";
import { verifyClearance } from "../security/clearance";
import { logRequest } from "../logging/requestLog";
import { trace } from "../logging/trace";
import { capabilitiesFor } from "../translation/capabilities";

export async function handleSession(rc: RequestContext): Promise<Response> {
  const { env, request } = rc;
  const { standbyTtlMs } = settingsFor(env);
  const admission = await admitRequest(rc);
  if (!admission.ok) return admission.response;
  const { ip, ipHash, gate } = admission.value;

  const [body, ring, withinLimit] = await Promise.all([
    readJsonBody<{ clearance?: string; clientVersion?: unknown }>(request, settingsFor(env).maxBodyBytes),
    resolveSecretRing(env),
    consumeSessionLimit(env, ipHash),
  ]);
  const unwelcome = await admitSealedClient(rc, body, ipHash);
  if (unwelcome) return unwelcome;

  if ((gate.requireClearance || !withinLimit) && !(await verifyClearance(ring, body?.clearance, ip))) {
    trace(1, "security", "CAPTCHA_REQUIRED", withinLimit ? "Clearance verification failed for session request" : "Session limit exceeded, clearance required", ipHash);
    return verificationRequired(rc, "clearance_required", ipHash);
  }

  const { token, challengeKey } = await issueSession(ring, standbyTtlMs, ip, ipHash);

  logRequest(rc, "ok", "", ipHash);
  return jsonResponse(rc, { token, challengeKey, worker_version: rc.workerVersion, capabilities: capabilitiesFor(env) }, 200);
}
