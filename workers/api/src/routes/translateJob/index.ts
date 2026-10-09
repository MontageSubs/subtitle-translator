import { settingsFor } from "../../config/settings";
import { ACTIVE_TTL_MS } from "../../config/timing";
import { readJsonBody } from "../../http/body";
import { elapsedMs, type RequestContext } from "../../http/context";
import { streamNdjson } from "../../http/ndjson";
import { invalidRequest, reject, verificationRequired } from "../../http/responses";
import { admitRequest } from "../../security/admission";
import { flagMalformedRequest, escalateOnLimiterTrip } from "../../security/gate";
import { consumeRateLimit } from "../../security/limiters";
import { consumeQuota } from "../../security/quota";
import { consumeGlobalBudget } from "../../security/reputation";
import { generateRecipe } from "../../security/clientCheck/recipe";
import { buildCueBloomFilter } from "../../security/retry/bloom";
import { advanceRetryScope, issueRetryToken, MAX_RETRY_BATCH_CUES, startRetryScope } from "../../security/retry/token";
import { resolveSecretRing } from "../../security/secretRing";
import { storeNonce } from "../../security/session/nonce";
import { issueSession } from "../../security/session/token";
import { logHttp, logSecurity, reportError } from "../../logging/log";
import { countJobError } from "../../counters/jobCounters";
import { isKnownProvider } from "../../translation/providers/registry";
import { resolveProviderLanguage } from "../../translation/providerLanguages";
import { authorize } from "./authorization";
import { MALFORMED_REQUEST_CODE } from "./errorCodes";
import { normalizeContext } from "../../translation/contextText";
import { isCountedJob, parseRequest, totalChars, type TranslateJobBody } from "./request";
import { streamTranslation } from "./stream";

const DEFAULT_PROVIDER = "google-nmt-pa";

export async function handleTranslateJob(rc: RequestContext): Promise<Response> {
  const { env, ctx } = rc;
  const admission = await admitRequest(rc);
  if (!admission.ok) return admission.response;
  const { ip, ipHash, now, gate } = admission.value;

  const malformed = (securityDetail: string, httpDetail: string): Response => {
    flagMalformedRequest(ctx, env, ipHash, now);
    countJobError(ctx, env, MALFORMED_REQUEST_CODE);
    logSecurity("MALFORMED_REQUEST", ipHash, securityDetail);
    return invalidRequest(rc, httpDetail, ipHash);
  };

  const body = await readJsonBody<TranslateJobBody>(rc.request, settingsFor(env).maxBodyBytes);
  if (!body) return malformed("Failed to parse JSON body", "Malformed JSON");
  const request = parseRequest(body, env.TRANSLATION_PROVIDER || DEFAULT_PROVIDER);
  if (!request) return malformed("Invalid cues or missing source/target language", "Invalid payload fields");

  if (!isKnownProvider(request.providerName)) {
    return reject(rc, { status: 400, body: { error: "unsupported_provider" }, detail: `Unsupported provider ${request.providerName}`, ipHash });
  }

  const targetLang = resolveProviderLanguage(request.providerName, request.target);
  const sourceLang = request.source === "auto" ? "auto" : resolveProviderLanguage(request.providerName, request.source);
  if (!targetLang || !sourceLang) {
    logSecurity("MALFORMED_REQUEST", ipHash, `Unsupported language for provider ${request.providerName}`);
    return reject(rc, { status: 400, body: { error: "unsupported_language" }, detail: "Unsupported target/source language for provider", ipHash });
  }

  const contentLimit = settingsFor(env).maxContentChars;
  const requestChars = totalChars(request.cues);
  if (requestChars > contentLimit) {
    countJobError(ctx, env, MALFORMED_REQUEST_CODE);
    logSecurity("PAYLOAD_TOO_LARGE", ipHash, `Payload exceeded char limit (${requestChars} > ${contentLimit})`);
    return reject(rc, { status: 413, body: { error: "payload_too_large", maxContentChars: contentLimit }, detail: "Payload too large", ipHash });
  }

  const scopedCues = request.wantsRetryScope ? request.cues.slice(0, MAX_RETRY_BATCH_CUES) : request.cues;
  const processedChars = request.wantsRetryScope ? totalChars(scopedCues) : requestChars;

  const ring = await resolveSecretRing(env);
  const authorization = await authorize({ rc, ring, admission: admission.value, request, scopedCues });
  if (!authorization.ok) return authorization.response;
  const auth = authorization.value;
  const isRetryContinuation = auth.retry !== null;

  const withinRateLimit = await consumeRateLimit(env, ipHash, processedChars, {
    degraded: gate.degraded,
    clearanceMultiplier: auth.clearanceMultiplier,
    plainVariant: auth.plainVariant,
  }).catch((error) => {
    reportError("rate limiter unavailable, failing closed", error);
    return false;
  });
  if (!withinRateLimit) {
    escalateOnLimiterTrip(ctx, env, ipHash, now);
    logSecurity("RATE_LIMITED", ipHash, `Unit rate limit budget exceeded (processedChars: ${processedChars}, cleared: ${auth.cleared})`);
    return reject(rc, { status: 429, body: { error: "rate_limited", trigger_turnstile: !auth.cleared }, detail: "Rate limited", ipHash });
  }

  const quota = await consumeQuota(caches.default, ctx, { ipHash, chars: processedChars, cleared: auth.cleared, enforce: !isRetryContinuation, now });
  if (quota === "verify") {
    logSecurity("QUOTA_VERIFY_REQUIRED", ipHash, `Soft usage quota reached (processedChars: ${processedChars})`);
    return verificationRequired(rc, "Usage quota requires verification", ipHash);
  }
  if (quota === "block") {
    if (!gate.quarantined) escalateOnLimiterTrip(ctx, env, ipHash, now);
    logSecurity("QUOTA_EXCEEDED", ipHash, `Hard usage quota reached (processedChars: ${processedChars}, cleared: ${auth.cleared})`);
    return reject(rc, { status: 429, body: { error: "quota_exceeded" }, detail: "Usage quota exceeded", ipHash });
  }

  if (!(await consumeGlobalBudget(env, now))) {
    logSecurity("GLOBAL_BUDGET_EXCEEDED", ipHash, "Global daily budget cap reached");
    return reject(rc, { status: 503, body: { error: "capacity_exceeded" }, detail: "Global budget exceeded", ipHash });
  }

  const nextRetryScope = auth.retry ? advanceRetryScope(auth.retry) : request.wantsRetryScope ? startRetryScope(buildCueBloomFilter(request.cues)) : null;
  const retryToken = nextRetryScope ? await issueRetryToken(ring, nextRetryScope, auth, ip) : undefined;

  const recipe = generateRecipe();
  const session = await issueSession(ring, ACTIVE_TTL_MS, recipe, ip);
  await storeNonce(caches.default, session.nonce, ipHash, ring.current, Math.ceil(ACTIVE_TTL_MS / 1000));

  logHttp("POST", rc.path, 200, elapsedMs(rc), undefined, `Started stream (${scopedCues.length} cues, ${processedChars} chars, provider: ${request.providerName})`);
  return streamNdjson(rc, (emit) =>
    streamTranslation(
      {
        rc,
        ipHash,
        request,
        authorization: auth,
        cues: scopedCues,
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

