import { settingsFor } from "../../config/settings";
import { ACTIVE_TTL_MS } from "../../config/timing";
import { readJsonBody } from "../../http/body";
import type { RequestContext } from "../../http/context";
import { streamNdjson } from "../../http/ndjson";
import { invalidRequest, reject, verificationRequired } from "../../http/responses";
import { admitRequest } from "../../security/admission";
import { flagMalformedRequest, escalateOnLimiterTrip } from "../../security/gate";
import { consumeRateLimit } from "../../security/limiters";
import { consumeQuota, quotaHint, quotaResetAt } from "../../security/quota";
import { consumeGlobalBudget } from "../../security/reputation";
import { generateRecipe } from "../../security/clientCheck/recipe";
import { buildCueBloomFilter } from "../../security/retry/bloom";
import { advanceRetryScope, issueRetryToken, MAX_RETRY_BATCH_CUES, startRetryScope } from "../../security/retry/token";
import { resolveSecretRing } from "../../security/secretRing";
import { storeNonce } from "../../security/session/nonce";
import { issueSession } from "../../security/session/token";
import { reportFault } from "../../logging/fault";
import { trace } from "../../logging/trace";
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
    trace(1, "security", "MALFORMED_REQUEST", securityDetail, ipHash);
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
    trace(1, "security", "MALFORMED_REQUEST", () => `Unsupported language for provider ${request.providerName}`, ipHash);
    return reject(rc, { status: 400, body: { error: "unsupported_language" }, detail: "Unsupported target/source language for provider", ipHash });
  }

  const contentLimit = settingsFor(env).maxContentChars;
  const requestChars = totalChars(request.cues);
  if (requestChars > contentLimit) {
    countJobError(ctx, env, MALFORMED_REQUEST_CODE);
    trace(1, "security", "PAYLOAD_TOO_LARGE", () => `Payload exceeded char limit (${requestChars} > ${contentLimit})`, ipHash);
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
    reportFault("rate limiter unavailable, failing closed", error, ipHash);
    return false;
  });
  if (!withinRateLimit) {
    escalateOnLimiterTrip(ctx, env, ipHash, now);
    trace(1, "security", "RATE_LIMITED", () => `Unit rate limit budget exceeded (processedChars: ${processedChars}, cleared: ${auth.cleared})`, ipHash);
    return reject(rc, { status: 429, body: { error: "rate_limited", trigger_turnstile: !auth.cleared }, detail: "Rate limited", ipHash });
  }

  const { verdict: quota, usage: quotaUsage } = await consumeQuota(caches.default, ctx, { ipHash, chars: processedChars, cleared: auth.cleared, enforce: !isRetryContinuation, now });
  if (quota === "verify") {
    trace(1, "security", "QUOTA_VERIFY_REQUIRED", () => `Soft usage quota reached (processedChars: ${processedChars})`, ipHash);
    return verificationRequired(rc, "Usage quota requires verification", ipHash, quotaHint(quotaUsage));
  }
  if (quota === "block") {
    if (!gate.quarantined) escalateOnLimiterTrip(ctx, env, ipHash, now);
    trace(1, "security", "QUOTA_EXCEEDED", () => `Hard usage quota reached (processedChars: ${processedChars}, cleared: ${auth.cleared})`, ipHash);
    return reject(rc, { status: 429, body: { error: "quota_exceeded", retry_at: quotaResetAt(quotaUsage) }, detail: "Usage quota exceeded", ipHash });
  }

  if (!(await consumeGlobalBudget(env, now))) {
    trace(1, "security", "GLOBAL_BUDGET_EXCEEDED", "Global daily budget cap reached", ipHash);
    return reject(rc, { status: 503, body: { error: "capacity_exceeded" }, detail: "Global budget exceeded", ipHash });
  }

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

