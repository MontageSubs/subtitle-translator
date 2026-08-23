import { Env, ACTIVE_TTL_MS, maxBatchChars, maxContentChars, maxBodyBytes } from "../env";
import { issueSession, verifyToken } from "../token";
import { computeAnswer, deriveChallengeKey } from "../challenge";
import { verifyProofVector } from "../envProbe";
import { verifyClearance } from "../turnstile";
import { consumeFreeQuota } from "../reputation";
import { resolveSecretRing } from "../secret";
import { consumeNonceOnce } from "../nonce";
import { hashIp, clientIp } from "../identity";
import { json, parseBody, logGate, reportError, ndjsonStream } from "../response";
import { gateForRequest, consumeBurst, escalateOnBurstTrip, consumeRateLimit } from "../gate";
import { recordCompletedJob } from "../stats";
import { runTranslateJob } from "../core/pipeline";
import { Glossary } from "../core/srtExtract";
import { ProtocolCue, computeRequestDigest, isValidProtocolCue } from "../protocol";
import { sha256Hex } from "../crypto";
import { issueRetryToken, verifyRetryToken, canonicalCueContent, RETRY_TOKEN_GUARD_TTL_MS } from "../retryToken";
import { consumeRetryTokenOnce } from "../retryTokenGuard";
import { MAX_CONTEXT_CHARS } from "../core/retryEscalation";

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
  proof?: { length: number; tag: string; variant: string; commitment: number };
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

export async function handleTranslateJob(request: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const startedAt = Date.now();
  const body = await parseBody<TranslateJobRequestBody>(request, maxBodyBytes(env));
  if (!body) return json({ error: "malformed JSON" }, 400, origin, env);

  const { source, target, sceneChangeSeconds, caseSensitiveTerms } = body;
  const glossary = isValidGlossary(body.glossary) ? body.glossary : {};
  if (!isValidCues(body.cues) || !source || !target) {
    return json({ error: "invalid translate-job request" }, 400, origin, env);
  }
  const cues = body.cues;

  const contentLimit = maxContentChars(env);
  const totalChars = cues.reduce((sum, cue) => sum + cue.text.length, 0);
  if (totalChars > contentLimit) {
    return json({ error: "payload exceeds maxContentChars", maxContentChars: contentLimit }, 413, origin, env);
  }

  const ipHash = await hashIp(env, clientIp(request));
  const now = Date.now();

  if (!(await consumeBurst(env, ipHash))) {
    escalateOnBurstTrip(ctx, env, ipHash, now);
    logGate("burst_detected", ipHash, { path: "/translate-job" });
    return json({ error: "rate_limited", trigger_turnstile: true }, 429, origin, env);
  }

  const gate = await gateForRequest(env, ipHash, now);
  if (gate.blocked) {
    logGate("ip_blocked", ipHash);
    return json({ error: "too many failed verifications, try again later" }, 403, origin, env);
  }

  const ring = await resolveSecretRing(env.WORKER_SECRET, env.WORKER_SALT || "");
  const verified = await verifyToken(ring, body.token || "");
  if (!verified) {
    return json({ error: "invalid or expired token" }, 401, origin, env);
  }
  const { payload, secret: matchedSecret } = verified;

  if (!(await consumeNonceOnce(env.DB, payload.nonce, now, payload.ttl))) {
    logGate("token_replay", ipHash);
    return json({ error: "token already used" }, 401, origin, env);
  }

  let correlationId = crypto.randomUUID();
  let isRetryContinuation = false;
  if (body.retryToken) {
    const payload = await verifyRetryToken(ring, body.retryToken);
    if (payload) {
      const contentHash = await sha256Hex(canonicalCueContent(cues));
      if (payload.content_hash === contentHash && await consumeRetryTokenOnce(env.DB, payload.correlation_id, now, RETRY_TOKEN_GUARD_TTL_MS)) {
        correlationId = payload.correlation_id;
        isRetryContinuation = true;
      }
    }
  }

  const contextText = !isRetryContinuation && typeof body.contextText === "string"
    ? body.contextText.trim().slice(0, MAX_CONTEXT_CHARS)
    : undefined;
  const contextNeedsTranslation = !isRetryContinuation && Boolean(body.contextNeedsTranslation);

  const proofCommitment = Number(body.proof?.commitment);
  const keyBytes = await deriveChallengeKey(matchedSecret, payload.nonce);
  const digest = computeRequestDigest("translate-job", source, target, glossary, cues);
  const expected = await computeAnswer(keyBytes, payload.nonce, digest, proofCommitment);
  if (expected !== body.answer) {
    logGate("challenge_mismatch", ipHash);
    return json({ error: "challenge mismatch" }, 403, origin, env);
  }

  const cleared = await verifyClearance(ring, body.clearance);
  if (!cleared) {
    if (gate.requireClearance) {
      logGate("turnstile_triggered", ipHash, { reason: "quarantine" });
      return json({ error: "quarantine active", trigger_turnstile: true }, 429, origin, env);
    }
    if (!(await verifyProofVector(payload.nonce, body.proof))) {
      logGate("turnstile_triggered", ipHash, { reason: "env_check_failed", variant: body.proof?.variant });
      return json({ error: "environment check failed", trigger_turnstile: true }, 429, origin, env);
    }
    if (gate.quarantined) {
      ctx.waitUntil(consumeFreeQuota(env.DB, ipHash, now).catch((e) => logGate("d1_write_failed", ipHash, { op: "consumeFreeQuota", message: String(e) })));
    }
  }
  if (body.proof?.variant === "plain") {
    logGate("clone_fallback_variant", ipHash, { variant: "plain" });
  }

  try {
    const success = await consumeRateLimit(env, ipHash, totalChars, gate.degraded, cleared);
    if (!success) {
      logGate("rate_limited", ipHash, { cleared });
      return json({ error: "rate_limited", trigger_turnstile: !cleared }, 429, origin, env);
    }
  } catch (e) {
    reportError("rate limiter unavailable, failing open", e);
  }

  return ndjsonStream(ctx, origin, env, async (emit) => {
    let job: Awaited<ReturnType<typeof runTranslateJob>>;
    try {
      job = await runTranslateJob(env, { cues, glossary, source, target, sceneChangeSeconds, caseSensitiveTerms, contextText, contextNeedsTranslation }, maxBatchChars(env), startedAt, (message) => emit({ type: "log", message }));
    } catch (e) {
      reportError("translate job failed", e);
      await emit({ type: "error", message: "translate job failed" });
      return;
    }

    let retryToken: string | undefined;
    if (job.success && job.missing_count > 0) {
      const missingIds = new Set(job.missing_cues);
      const outstandingCues = cues.filter((cue) => missingIds.has(cue.id));
      const contentHash = await sha256Hex(canonicalCueContent(outstandingCues));
      retryToken = await issueRetryToken(ring, { correlationId, contentHash, outstandingIds: job.missing_cues });
    } else if (job.success) {
      recordCompletedJob(ctx, env);
    }

    const { token, challengeKey, nonce } = await issueSession(ring, ACTIVE_TTL_MS);
    await emit({ type: "result", ...job, retry_token: retryToken, token, challengeKey, nonce });
  });
}
