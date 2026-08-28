import { Env, ACTIVE_TTL_MS, maxBatchChars, maxContentChars, maxBodyBytes, globalDailyBudget } from '../config/env';
import { issueSession, verifyToken } from '../security/token';
import { computeAnswer, deriveChallengeKey } from '../security/challenge';
import { verifyProofVector, proofCommitment, generateRecipe } from '../config/envProbe';
import { verifyClearance } from '../security/turnstile';
import { consumeFreeQuota, consumeGlobalBudget, recordCompletedJob as recordCompletedReputation } from '../security/reputation';
import { resolveSecretRing } from '../config/secret';
import { consumeNonceFromCache, storeNonceInCache } from '../security/nonce';
import { hashIp, clientIp } from '../security/identity';
import { json, parseBody, logGate, reportError, ndjsonStream } from '../http/response';
import { gateForRequest, consumeBurst, escalateOnBurstTrip, consumeRateLimit, flagMalformedRequest } from '../security/gate';
import { recordCompletedJob } from '../services/stats';
import { runTranslateJobStream } from "../core/pipeline";
import { Glossary } from "../core/srtExtract";
import { ProtocolCue, computeRequestDigest, isValidProtocolCue } from '../http/protocol';
import { sha256Hex } from '../security/crypto';
import { issueRetryToken, verifyRetryToken, canonicalCueContent, RETRY_TOKEN_GUARD_TTL_MS } from '../security/retryToken';
import { consumeRetryTokenOnce, storeRetryTokenInCache } from '../security/retryTokenGuard';
import { logHttp, logSecurity, logAuth, logDb } from '../core/log';

const MAX_CONTEXT_CHARS = 500;

interface TranslateJobRequestBody {
  token?: string;
  answer?: number;
  cues?: ProtocolCue[];
  glossary?: Glossary;
  source?: string;
  target?: string;
  provider?: string;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
  contextText?: string;
  contextNeedsTranslation?: boolean;
  clearance?: string;
  proof?: { variant: string; transcript: number[] };
  retryToken?: string;
}

const MAX_GLOSSARY_ENTRIES = 500;
const MAX_GLOSSARY_ENTRY_CHARS = 200;
const MAX_CUES_PER_REQUEST = 20_000;

function isValidGlossary(value: unknown): value is Glossary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_GLOSSARY_ENTRIES) return false;
  return entries.every(([k, v]) => typeof k === "string" && typeof v === "string" && k.length <= MAX_GLOSSARY_ENTRY_CHARS && v.length <= MAX_GLOSSARY_ENTRY_CHARS);
}

function isValidCues(value: unknown): value is ProtocolCue[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_CUES_PER_REQUEST && value.every(isValidProtocolCue);
}

function invalidRequest(origin: string, env: Env): Response {
  return json({ error: "invalid_request" }, 400, origin, env);
}

function verificationFailed(origin: string, env: Env): Response {
  return json({ error: "verification_failed" }, 403, origin, env);
}

function verificationRequired(origin: string, env: Env): Response {
  return json({ error: "verification_required", trigger_turnstile: true }, 429, origin, env);
}

export async function handleTranslateJob(request: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const startedAt = Date.now();
  const ip = clientIp(request);
  const ipHash = await hashIp(env, ip);
  const now = Date.now();

  if (!(await consumeBurst(env, ipHash))) {
    escalateOnBurstTrip(ctx, env, ipHash, now);
    logSecurity("BURST_TRIPPED", ipHash, "Exceeded rate limit on /translate-job -> Escalating quarantine in D1 ip_shield");
    logHttp("POST", "/translate-job", 429, Date.now() - startedAt, ipHash, "Burst trip");
    return verificationRequired(origin, env);
  }

  const gate = await gateForRequest(env, request, ipHash, now);
  if (gate.blocked) {
    logSecurity("IP_BLOCKED", ipHash, "Blocked in D1 ip_shield");
    logHttp("POST", "/translate-job", 403, Date.now() - startedAt, ipHash, "Blocked IP");
    return verificationFailed(origin, env);
  }

  const body = await parseBody<TranslateJobRequestBody>(request, maxBodyBytes(env));
  if (!body) {
    flagMalformedRequest(ctx, env, ipHash, now);
    logSecurity("MALFORMED_REQUEST", ipHash, "Failed to parse JSON body");
    logHttp("POST", "/translate-job", 400, Date.now() - startedAt, ipHash, "Malformed JSON");
    return invalidRequest(origin, env);
  }

  const { source, target, provider, sceneChangeSeconds, caseSensitiveTerms } = body;
  const glossary = isValidGlossary(body.glossary) ? body.glossary : {};
  if (!isValidCues(body.cues) || !source || !target) {
    flagMalformedRequest(ctx, env, ipHash, now);
    logSecurity("MALFORMED_REQUEST", ipHash, "Invalid cues or missing source/target language");
    logHttp("POST", "/translate-job", 400, Date.now() - startedAt, ipHash, "Invalid payload fields");
    return invalidRequest(origin, env);
  }
  const cues = body.cues;

  const contentLimit = maxContentChars(env);
  const totalChars = cues.reduce((sum, cue) => sum + cue.text.length, 0);
  if (totalChars > contentLimit) {
    logSecurity("PAYLOAD_TOO_LARGE", ipHash, `Payload exceeded char limit (${totalChars} > ${contentLimit})`);
    logHttp("POST", "/translate-job", 413, Date.now() - startedAt, ipHash, "Payload too large");
    return json({ error: "payload_too_large", maxContentChars: contentLimit }, 413, origin, env);
  }

  const ring = await resolveSecretRing(env.WORKER_SECRET_A || "", env.WORKER_SECRET_B || "", env.WORKER_SALT || "");
  const verified = await verifyToken(ring, body.token || "", ip);
  if (!verified) {
    logAuth("TOKEN_INVALID", ipHash, "Session token verification failed (invalid signature or expired)");
    logHttp("POST", "/translate-job", 403, Date.now() - startedAt, ipHash, "Token verification failed");
    return verificationFailed(origin, env);
  }
  const { payload, secret: matchedSecret } = verified;
  logAuth("TOKEN_VERIFIED", ipHash, `Session token verified (cv: ${payload.cv}, tag: ${payload.recipe.tag})`);

  if (!(await consumeNonceFromCache(caches.default, payload.nonce, ip, matchedSecret))) {
    logAuth("TOKEN_REPLAY", ipHash, "Session nonce replay attack detected (nonce already consumed)");
    logHttp("POST", "/translate-job", 403, Date.now() - startedAt, ipHash, "Token replay");
    return verificationFailed(origin, env);
  }
  logAuth("NONCE_CONSUMED", ipHash, `Nonce ${payload.nonce} consumed`);

  const proofCommitmentValue = proofCommitment(body.proof);
  const keyBytes = await deriveChallengeKey(matchedSecret, payload.nonce);
  const digest = computeRequestDigest("translate-job", source, target, glossary, cues);
  const expected = await computeAnswer(keyBytes, payload.nonce, digest, proofCommitmentValue);
  if (expected !== body.answer) {
    logAuth("CHALLENGE_MISMATCH", ipHash, `Challenge answer mismatch (expected: ${expected}, got: ${body.answer})`);
    logHttp("POST", "/translate-job", 403, Date.now() - startedAt, ipHash, "Challenge answer mismatch");
    return verificationFailed(origin, env);
  }
  logAuth("CHALLENGE_VERIFIED", ipHash, `Challenge answer matched (${expected})`);

  let correlationId = crypto.randomUUID();
  let isRetryContinuation = false;
  if (body.retryToken) {
    const retryVerified = await verifyRetryToken(ring, body.retryToken, ip);
    if (retryVerified) {
      const { payload: retryPayload, secret: retrySecret } = retryVerified;
      const contentHash = await sha256Hex(canonicalCueContent(cues));
      const isValidHash = retryPayload.content_hash === contentHash;
      const containsAllCues = Array.isArray(retryPayload.outstanding_ids) && cues.every((c) => retryPayload.outstanding_ids.includes(c.id));
      if ((isValidHash || containsAllCues) && await consumeRetryTokenOnce(caches.default, retryPayload.correlation_id, ip, retrySecret)) {
        correlationId = retryPayload.correlation_id;
        isRetryContinuation = true;
        logAuth("RETRY_TOKEN_ACCEPTED", ipHash, `Retry token accepted (correlationId: ${correlationId})`);
      }
    }
  }

  const contextText = !isRetryContinuation && typeof body.contextText === "string"
    ? body.contextText.trim().slice(0, MAX_CONTEXT_CHARS)
    : undefined;
  const contextNeedsTranslation = !isRetryContinuation && Boolean(body.contextNeedsTranslation);

  const plainVariant = body.proof?.variant === "plain";
  const cleared = await verifyClearance(ring, body.clearance, ip);
  if (cleared) {
    logSecurity("CLEARANCE_VERIFIED", ipHash, "Turnstile clearance token verified");
  } else {
    if (gate.requireClearance) {
      logSecurity("TURNSTILE_REQUIRED", ipHash, "Quarantine requires Turnstile clearance");
      logHttp("POST", "/translate-job", 429, Date.now() - startedAt, ipHash, "Quarantine clearance required");
      return verificationRequired(origin, env);
    }
    if (!(await verifyProofVector(payload.nonce, payload.recipe, body.proof))) {
      logSecurity("TURNSTILE_REQUIRED", ipHash, `Environment probe verification failed (variant: ${body.proof?.variant || "none"})`);
      logHttp("POST", "/translate-job", 429, Date.now() - startedAt, ipHash, "Env probe failed");
      return verificationRequired(origin, env);
    }
    if (plainVariant) {
      logSecurity("TURNSTILE_REQUIRED", ipHash, "Clone fallback variant detected");
      logHttp("POST", "/translate-job", 429, Date.now() - startedAt, ipHash, "Clone fallback variant");
      return verificationRequired(origin, env);
    }
    if (gate.quarantined) {
      ctx.waitUntil(consumeFreeQuota(env.DB, ipHash, now).catch((e) => logDb("D1_ERROR", ipHash, `consumeFreeQuota failed: ${e instanceof Error ? e.message : String(e)}`)));
    }
  }

  const withinRateLimit = await consumeRateLimit(env, ipHash, totalChars, gate.degraded, cleared ? gate.clearanceMultiplier : 1, plainVariant).catch((e) => {
    reportError("rate limiter unavailable, failing closed", e);
    return false;
  });
  if (!withinRateLimit) {
    logSecurity("RATE_LIMITED", ipHash, `Unit rate limit budget exceeded (totalChars: ${totalChars}, cleared: ${cleared})`);
    logHttp("POST", "/translate-job", 429, Date.now() - startedAt, ipHash, "Rate limited");
    return json({ error: "rate_limited", trigger_turnstile: !cleared }, 429, origin, env);
  }

  if (!(await consumeGlobalBudget(env.DB, now, globalDailyBudget(env)))) {
    logSecurity("GLOBAL_BUDGET_EXCEEDED", ipHash, "Global daily budget cap reached");
    logHttp("POST", "/translate-job", 503, Date.now() - startedAt, ipHash, "Global budget exceeded");
    return json({ error: "capacity_exceeded" }, 503, origin, env);
  }

  const clientUserAgent = request.headers.get("User-Agent") || undefined;

  const initialContentHash = await sha256Hex(canonicalCueContent(cues));
  const preissuedRetryToken = await issueRetryToken(ring, { correlationId, contentHash: initialContentHash, outstandingIds: cues.map((c) => c.id) }, ip);
  const preissuedTtlSeconds = Math.ceil(RETRY_TOKEN_GUARD_TTL_MS / 1000);
  await storeRetryTokenInCache(caches.default, correlationId, ip, ring.current, preissuedTtlSeconds);

  const firstFrameRecipe = generateRecipe();
  const { token: firstFrameToken, challengeKey: firstFrameChallengeKey, nonce: firstFrameNonce } = await issueSession(ring, ACTIVE_TTL_MS, firstFrameRecipe, ip);
  const firstFrameTtl = Math.ceil(ACTIVE_TTL_MS / 1000);
  await storeNonceInCache(caches.default, firstFrameNonce, ip, ring.current, firstFrameTtl);
  
  logHttp("POST", "/translate-job", 200, Date.now() - startedAt, ipHash, `Started stream (${cues.length} cues, ${totalChars} chars, provider: ${provider || "google-nmt-pa"})`);
  return ndjsonStream(ctx, origin, env, async (emit) => {
    await emit({
      type: "init",
      token: firstFrameToken,
      challengeKey: firstFrameChallengeKey,
      nonce: firstFrameNonce,
      recipe: firstFrameRecipe,
      retry_token: preissuedRetryToken,
      correlation_id: correlationId,
    });

    let finalSummary: any = null;
    try {
      const stream = runTranslateJobStream(
        env, { cues, glossary, source, target, provider, sceneChangeSeconds, caseSensitiveTerms, contextText, contextNeedsTranslation }, 
        maxBatchChars(env), startedAt, clientUserAgent, (message) => emit({ type: "log", message })
      );
      
      for await (const chunk of stream) {
        finalSummary = {
          success: true,
          resolved_source_lang: chunk.resolvedSourceLang || source,
          approx_splits: chunk.approx_splits,
          missing_count: chunk.missing_count,
          missing_cues: chunk.missing_cues,
          quality_warnings: chunk.quality_warnings,
          provider: chunk.provider,
        };
        if (chunk.cues.length > 0) {
          await emit({
            type: "result_chunk",
            data: {
              cues: chunk.cues,
              resolved_source_lang: chunk.resolvedSourceLang || source,
              provider: chunk.provider,
            }
          });
        }
      }
      
      if (!finalSummary) {
        finalSummary = { success: false, resolved_source_lang: source, approx_splits: [], missing_count: 0, missing_cues: [], quality_warnings: [], provider: provider || "google-nmt-pa" };
      }
    } catch (e) {
      reportError("translate job failed", e);
      logSecurity("JOB_FAILED", ipHash, `Translation job execution error: ${e instanceof Error ? e.message : String(e)}`);
      await emit({ type: "error", message: "translate job failed" });
      return;
    }

    let retryToken: string = preissuedRetryToken;
    if (finalSummary.success && finalSummary.missing_count > 0) {
      logSecurity("MISSING_CUES_AGGREGATED", ipHash, `Translation returned ${finalSummary.missing_count} missing cue(s): [${finalSummary.missing_cues.join(", ")}]`);
      const missingIds = new Set(finalSummary.missing_cues);
      const outstandingCues = cues.filter((cue) => missingIds.has(cue.id));
      const contentHash = await sha256Hex(canonicalCueContent(outstandingCues));
      retryToken = await issueRetryToken(ring, { correlationId, contentHash, outstandingIds: finalSummary.missing_cues }, ip);
      const ttlSeconds = Math.ceil(RETRY_TOKEN_GUARD_TTL_MS / 1000);
      await storeRetryTokenInCache(caches.default, correlationId, ip, ring.current, ttlSeconds);
    } else if (finalSummary.success) {
      recordCompletedJob(ctx, env);
      ctx.waitUntil(
        recordCompletedReputation(env, env.DB, ipHash, now)
          .then(() => logDb("RECORD_COMPLETED", ipHash, "Recorded completed translation job in D1 ip_shield"))
          .catch((e) => logDb("D1_ERROR", ipHash, `recordCompletedReputation failed: ${e instanceof Error ? e.message : String(e)}`))
      );
    }

    const nextRecipe = generateRecipe();
    const { token, challengeKey, nonce } = await issueSession(ring, ACTIVE_TTL_MS, nextRecipe, ip);
    
    const ttlSeconds = Math.ceil(ACTIVE_TTL_MS / 1000);
    await storeNonceInCache(caches.default, nonce, ip, ring.current, ttlSeconds);

    await emit({ type: "result", ...finalSummary, retry_token: retryToken, token, challengeKey, nonce, recipe: nextRecipe });
  });
}
