import { Env, ACTIVE_TTL_MS, maxBatchChars, maxContentChars, maxBodyBytes, globalDailyBudget } from "../env";
import { issueSession, verifyToken } from "../token";
import { computeAnswer, deriveChallengeKey } from "../challenge";
import { verifyProofVector, proofCommitment, generateRecipe } from "../envProbe";
import { verifyClearance } from "../turnstile";
import { consumeFreeQuota, consumeGlobalBudget, recordCompletedJob as recordCompletedReputation } from "../reputation";
import { resolveSecretRing } from "../secret";
import { consumeNonceOnce } from "../nonce";
import { hashIp, clientIp } from "../identity";
import { json, parseBody, logGate, reportError, ndjsonStream } from "../response";
import { gateForRequest, consumeBurst, escalateOnBurstTrip, consumeRateLimit, flagMalformedRequest } from "../gate";
import { recordCompletedJob } from "../stats";
import { runTranslateJobStream } from "../core/pipeline";
import { Glossary } from "../core/srtExtract";
import { ProtocolCue, computeRequestDigest, isValidProtocolCue } from "../protocol";
import { sha256Hex } from "../crypto";
import { issueRetryToken, verifyRetryToken, canonicalCueContent, RETRY_TOKEN_GUARD_TTL_MS } from "../retryToken";
import { consumeRetryTokenOnce } from "../retryTokenGuard";

const MAX_CONTEXT_CHARS = 500;

interface TranslateJobRequestBody {
  token?: string;
  answer?: number;
  cues?: ProtocolCue[];
  glossary?: Glossary;
  source?: string;
  target?: string;
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
  const ipHash = await hashIp(env, clientIp(request));
  const now = Date.now();

  if (!(await consumeBurst(env, ipHash))) {
    escalateOnBurstTrip(ctx, env, ipHash, now);
    logGate("burst_detected", ipHash, { path: "/translate-job" });
    return verificationRequired(origin, env);
  }

  const gate = await gateForRequest(env, request, ipHash, now);
  if (gate.blocked) {
    logGate("ip_blocked", ipHash);
    return verificationFailed(origin, env);
  }

  if (!(await consumeGlobalBudget(env.DB, now, globalDailyBudget(env)))) {
    logGate("global_budget_exceeded", ipHash);
    return json({ error: "capacity_exceeded" }, 503, origin, env);
  }

  const body = await parseBody<TranslateJobRequestBody>(request, maxBodyBytes(env));
  if (!body) {
    flagMalformedRequest(ctx, env, ipHash, now);
    return invalidRequest(origin, env);
  }

  const { source, target, sceneChangeSeconds, caseSensitiveTerms } = body;
  const glossary = isValidGlossary(body.glossary) ? body.glossary : {};
  if (!isValidCues(body.cues) || !source || !target) {
    flagMalformedRequest(ctx, env, ipHash, now);
    return invalidRequest(origin, env);
  }
  const cues = body.cues;

  const contentLimit = maxContentChars(env);
  const totalChars = cues.reduce((sum, cue) => sum + cue.text.length, 0);
  if (totalChars > contentLimit) {
    return json({ error: "payload_too_large", maxContentChars: contentLimit }, 413, origin, env);
  }

  const ring = await resolveSecretRing(env.WORKER_SECRET_A || "", env.WORKER_SECRET_B || "", env.WORKER_SALT || "");
  const verified = await verifyToken(ring, body.token || "");
  if (!verified) {
    return verificationFailed(origin, env);
  }
  const { payload, secret: matchedSecret } = verified;

  const proofCommitmentValue = proofCommitment(body.proof);
  const keyBytes = await deriveChallengeKey(matchedSecret, payload.nonce);
  const digest = computeRequestDigest("translate-job", source, target, glossary, cues);
  const expected = await computeAnswer(keyBytes, payload.nonce, digest, proofCommitmentValue);
  if (expected !== body.answer) {
    logGate("challenge_mismatch", ipHash);
    return verificationFailed(origin, env);
  }

  if (!(await consumeNonceOnce(env.DB, payload.nonce, now, payload.ttl))) {
    logGate("token_replay", ipHash);
    return verificationFailed(origin, env);
  }

  let correlationId = crypto.randomUUID();
  let isRetryContinuation = false;
  if (body.retryToken) {
    const retryPayload = await verifyRetryToken(ring, body.retryToken);
    if (retryPayload) {
      const contentHash = await sha256Hex(canonicalCueContent(cues));
      if (retryPayload.content_hash === contentHash && await consumeRetryTokenOnce(env.DB, retryPayload.correlation_id, now, RETRY_TOKEN_GUARD_TTL_MS)) {
        correlationId = retryPayload.correlation_id;
        isRetryContinuation = true;
      }
    }
  }

  const contextText = !isRetryContinuation && typeof body.contextText === "string"
    ? body.contextText.trim().slice(0, MAX_CONTEXT_CHARS)
    : undefined;
  const contextNeedsTranslation = !isRetryContinuation && Boolean(body.contextNeedsTranslation);

  const plainVariant = body.proof?.variant === "plain";
  const cleared = await verifyClearance(ring, body.clearance);
  if (!cleared) {
    if (gate.requireClearance) {
      logGate("turnstile_triggered", ipHash, { reason: "quarantine" });
      return verificationRequired(origin, env);
    }
    if (!(await verifyProofVector(payload.nonce, payload.recipe, body.proof))) {
      logGate("turnstile_triggered", ipHash, { reason: "env_check_failed", variant: body.proof?.variant });
      return verificationRequired(origin, env);
    }
    if (plainVariant) {
      logGate("turnstile_triggered", ipHash, { reason: "clone_fallback_variant" });
      return verificationRequired(origin, env);
    }
    if (gate.quarantined) {
      ctx.waitUntil(consumeFreeQuota(env.DB, ipHash, now).catch((e) => logGate("d1_write_failed", ipHash, { op: "consumeFreeQuota", message: String(e) })));
    }
  }

  const withinRateLimit = await consumeRateLimit(env, ipHash, totalChars, gate.degraded, cleared ? gate.clearanceMultiplier : 1, plainVariant).catch((e) => {
    reportError("rate limiter unavailable, failing closed", e);
    return false;
  });
  if (!withinRateLimit) {
    logGate("rate_limited", ipHash, { cleared });
    return json({ error: "rate_limited", trigger_turnstile: !cleared }, 429, origin, env);
  }

  const clientUserAgent = request.headers.get("User-Agent") || undefined;
  
  return ndjsonStream(ctx, origin, env, async (emit) => {
    let finalJob: any = null;
    try {
      const stream = runTranslateJobStream(
        env, { cues, glossary, source, target, sceneChangeSeconds, caseSensitiveTerms, contextText, contextNeedsTranslation }, 
        maxBatchChars(env), startedAt, clientUserAgent, (message) => emit({ type: "log", message })
      );
      
      for await (const chunk of stream) {
        finalJob = {
          success: true,
          resolved_source_lang: chunk.resolvedSourceLang || source,
          cues: chunk.cues,
          approx_splits: chunk.approx_splits,
          missing_count: chunk.missing_count,
          missing_cues: chunk.missing_cues,
          quality_warnings: chunk.quality_warnings
        };
        await emit({ type: "result_chunk", data: finalJob });
      }
      
      if (!finalJob) {
        finalJob = { success: false, resolved_source_lang: source, cues: [], approx_splits: [], missing_count: 0, missing_cues: [], quality_warnings: [] };
      }
    } catch (e) {
      reportError("translate job failed", e);
      await emit({ type: "error", message: "translate job failed" });
      return;
    }

    let retryToken: string | undefined;
    if (finalJob.success && finalJob.missing_count > 0) {
      const missingIds = new Set(finalJob.missing_cues);
      const outstandingCues = cues.filter((cue) => missingIds.has(cue.id));
      const contentHash = await sha256Hex(canonicalCueContent(outstandingCues));
      retryToken = await issueRetryToken(ring, { correlationId, contentHash, outstandingIds: finalJob.missing_cues });
    } else if (finalJob.success) {
      recordCompletedJob(ctx, env);
      ctx.waitUntil(recordCompletedReputation(env, env.DB, ipHash, now).catch((e) => logGate("d1_write_failed", ipHash, { op: "recordCompletedJob", message: String(e) })));
    }

    const nextRecipe = generateRecipe();
    const { token, challengeKey, nonce } = await issueSession(ring, ACTIVE_TTL_MS, nextRecipe);
    await emit({ type: "result", ...finalJob, retry_token: retryToken, token, challengeKey, nonce, recipe: nextRecipe });
  });
}
