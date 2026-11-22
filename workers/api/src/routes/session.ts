import { settingsFor } from "../config/settings";
import { readJsonBody } from "../http/body";
import type { RequestContext } from "../http/context";
import { readClientReport } from "../http/clientReport";
import { invalidRequest, jsonResponse, verificationRequired } from "../http/responses";
import { openGate, throttleClient } from "../security/admission";
import { admitSealedClient, readHandshakeClaim, sealLookupFor } from "../security/clientSeal";
import { consumeSessionLimit } from "../security/limiters";
import { resolveSecretRing } from "../security/secretRing";
import { issueSession } from "../security/session";
import { verifyClearance } from "../security/clearance";
import { describeHandshake } from "../logging/handshakeFields";
import { logRequest } from "../logging/requestLog";
import { trace } from "../logging/trace";
import { capabilitiesFor } from "../translation/capabilities";

const SESSION_BODY_MAX_BYTES = 4096;

export async function handleSession(rc: RequestContext): Promise<Response> {
  const { env, request } = rc;
  const throttled = await throttleClient(rc);
  if (!throttled.ok) return throttled.response;
  const { ip, ipHash } = throttled.value;

  const [body, ring, withinLimit] = await Promise.all([
    readJsonBody<{ clearance?: string; clientVersion?: unknown; ls?: unknown }>(request, SESSION_BODY_MAX_BYTES),
    resolveSecretRing(env),
    consumeSessionLimit(env, ipHash),
  ]);
  if (!readClientReport(rc, body)) {
    throttled.value.ledger.penalize();
    return invalidRequest(rc, "last_status_invalid", ipHash);
  }
  const claim = readHandshakeClaim(body);
  const admitted = await openGate(rc, throttled.value, sealLookupFor(claim));
  if (!admitted.ok) return admitted.response;
  const unwelcome = await admitSealedClient(rc, admitted.value, claim);
  if (unwelcome) return unwelcome;

  if ((admitted.value.gate.requireClearance || !withinLimit) && !(await verifyClearance(ring, body?.clearance, ip))) {
    trace(1, "security", "CAPTCHA_REQUIRED", withinLimit ? "Clearance verification failed for session request" : "Session limit exceeded, clearance required", ipHash);
    return verificationRequired(rc, "clearance_required", ipHash);
  }

  const { token, challengeKey } = await issueSession(ring, settingsFor(env).standbyTtlMs, ip);

  logRequest(rc, "ok", describeHandshake(request, claim.hello), ipHash);
  return jsonResponse(rc, { token, challengeKey, worker_version: rc.workerVersion, capabilities: capabilitiesFor(env) }, 200);
}
