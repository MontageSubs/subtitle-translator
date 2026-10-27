import { settingsFor } from "../../config/settings";
import { ACTIVE_TTL_MS } from "../../config/timing";
import { readJsonBody } from "../../http/body";
import { noteClientVersion } from "../../http/clientVersion";
import type { RequestContext } from "../../http/context";
import { streamNdjson } from "../../http/ndjson";
import { invalidRequest, reject } from "../../http/responses";
import { admitRequest } from "../../security/admission";
import { flagMalformedRequest } from "../../security/gate";
import { meterWorkload } from "../../security/metering";
import { generateRecipe } from "../../security/clientCheck/recipe";
import { buildCueBloomFilter } from "../../security/retry/bloom";
import { advanceRetryScope, issueRetryToken, MAX_RETRY_BATCH_CUES, startRetryScope } from "../../security/retry/token";
import { resolveSecretRing } from "../../security/secretRing";
import { storeNonce } from "../../security/session/nonce";
import { issueSession } from "../../security/session/token";
import { trace } from "../../logging/trace";
import { countJobError } from "../../counters/jobCounters";
import { DEFAULT_PROVIDER, isKnownProvider } from "../../translation/providers/registry";
import { resolveProviderLanguage } from "../../translation/providerLanguages";
import { authorize } from "./authorization";
import { MALFORMED_REQUEST_CODE } from "./errorCodes";
import { normalizeContext } from "../../translation/contextText";
import { isCountedJob, parseRequest, totalChars, type TranslateJobBody } from "./request";
import { streamTranslation } from "./stream";

export async function handleTranslateJob(rc: RequestContext): Promise<Response> {
  const { env, ctx } = rc;
  const admission = await admitRequest(rc);
  if (!admission.ok) return admission.response;
  const { ip, ipHash, now } = admission.value;

  const malformed = (securityDetail: string, reason: string): Response => {
    flagMalformedRequest(ctx, env, ipHash, now);
    countJobError(ctx, env, MALFORMED_REQUEST_CODE);
    trace(1, "security", "MALFORMED_REQUEST", securityDetail, ipHash);
    return invalidRequest(rc, reason, ipHash);
  };

  const body = await readJsonBody<TranslateJobBody>(rc.request, settingsFor(env).maxBodyBytes);
  if (!body) return malformed("Failed to parse JSON body", "malformed_json");
  noteClientVersion(rc, body.clientVersion);
  const request = parseRequest(body, env.TRANSLATION_PROVIDER || DEFAULT_PROVIDER);
  if (!request) return malformed("Invalid cues or missing source/target language", "invalid_fields");

  if (!isKnownProvider(request.providerName)) {
    return reject(rc, { status: 400, body: { error: "unsupported_provider" }, reason: "unsupported_provider", ipHash });
  }

  const targetLang = resolveProviderLanguage(request.providerName, request.target);
  const sourceLang = request.source === "auto" ? "auto" : resolveProviderLanguage(request.providerName, request.source);
  if (!targetLang || !sourceLang) {
    trace(1, "security", "MALFORMED_REQUEST", () => `Unsupported language for provider ${request.providerName}`, ipHash);
    return reject(rc, { status: 400, body: { error: "unsupported_language" }, reason: "unsupported_language", ipHash });
  }

  const contentLimit = settingsFor(env).maxContentChars;
  const requestChars = totalChars(request.cues);
  if (requestChars > contentLimit) {
    countJobError(ctx, env, MALFORMED_REQUEST_CODE);
    trace(1, "security", "PAYLOAD_TOO_LARGE", () => `Payload exceeded char limit (${requestChars} > ${contentLimit})`, ipHash);
    return reject(rc, { status: 413, body: { error: "payload_too_large", maxContentChars: contentLimit }, reason: "payload_too_large", ipHash });
  }

  const scopedCues = request.wantsRetryScope ? request.cues.slice(0, MAX_RETRY_BATCH_CUES) : request.cues;
  const processedChars = request.wantsRetryScope ? totalChars(scopedCues) : requestChars;

  const ring = await resolveSecretRing(env);
  const authorization = await authorize({ rc, ring, admission: admission.value, request, scopedCues });
  if (!authorization.ok) return authorization.response;
  const auth = authorization.value;
  const isRetryContinuation = auth.retry !== null;

  const metered = await meterWorkload(rc, admission.value, {
    chars: processedChars,
    cleared: auth.cleared,
    clearanceMultiplier: auth.clearanceMultiplier,
    plainVariant: auth.plainVariant,
    enforceQuota: !isRetryContinuation,
  });
  if (!metered.ok) return metered.response;

  const nextRetryScope = auth.retry ? advanceRetryScope(auth.retry) : request.wantsRetryScope ? startRetryScope(buildCueBloomFilter(request.cues)) : null;
  const retryToken = nextRetryScope ? await issueRetryToken(ring, nextRetryScope, auth, ip) : undefined;

  const recipe = generateRecipe();
  const session = await issueSession(ring, ACTIVE_TTL_MS, recipe, ip);
  await storeNonce(caches.default, session.nonce, ipHash, ring.current, Math.ceil(ACTIVE_TTL_MS / 1000));

  return streamNdjson(rc, (emit) =>
    streamTranslation(
      {
        rc,
        ipHash,
        request,
        authorization: auth,
        cues: scopedCues,
        chars: processedChars,
        sourceLang,
        targetLang,
        contextText: isRetryContinuation ? undefined : normalizeContext(body.contextText),
        contextNeedsTranslation: !isRetryContinuation && Boolean(body.contextNeedsTranslation),
        retryToken,
        counted: isCountedJob(request),
        firstFrame: { ...session, recipe },
      },
      emit
    )
  );
}

