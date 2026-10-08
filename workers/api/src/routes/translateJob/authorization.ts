import type { RequestContext } from "../../http/context";
import { halt, proceed, type Outcome } from "../../http/outcome";
import { verificationFailed, verificationRequired, reject } from "../../http/responses";
import type { Admission } from "../../security/admission";
import { proofCommitment, verifyProofVector } from "../../security/probe/proof";
import type { SecretRing } from "../../security/secretRing";
import { computeAnswer, deriveChallengeKey } from "../../security/session/challenge";
import { consumeNonce } from "../../security/session/nonce";
import { verifySession } from "../../security/session/token";
import { verifyCuesInBloomFilter } from "../../security/retry/bloom";
import { markRetryTokenConsumed } from "../../security/retry/tombstone";
import { verifyRetryToken } from "../../security/retry/token";
import { verifyClearance } from "../../security/turnstile";
import type { ProtocolCue } from "../../http/protocol";
import { logAuth, logSecurity } from "../../telemetry/log";
import type { ParsedRequest } from "./request";

export interface Authorization {
  correlationId: string;
  cleared: boolean;
  clearanceMultiplier: number;
  plainVariant: boolean;
  retryBloomFilter: string | null;
}

interface AuthInput {
  rc: RequestContext;
  ring: SecretRing;
  admission: Admission;
  request: ParsedRequest;
  scopedCues: ProtocolCue[];
}

const RETRY_TOKEN_GRACE_SECONDS = 5;

type RetryRejection = "signature_or_expiry_invalid" | "content_scope_mismatch" | "already_consumed_or_guard_missing";

async function authorizeRetryToken({ rc, ring, admission, request, scopedCues }: AuthInput): Promise<Outcome<Authorization>> {
  const { ip, ipHash, gate } = admission;
  let rejection: RetryRejection = "signature_or_expiry_invalid";
  const verified = await verifyRetryToken(ring, request.body.retryToken!, ip);

  if (verified) {
    const { payload, secret } = verified;
    if (!verifyCuesInBloomFilter(scopedCues, payload.bloom_filter)) {
      rejection = "content_scope_mismatch";
    } else {
      const ttlSeconds = Math.max(1, Math.ceil((payload.exp - Date.now()) / 1000) + RETRY_TOKEN_GRACE_SECONDS);
      if (await markRetryTokenConsumed(caches.default, payload.correlation_id, ipHash, secret, ttlSeconds)) {
        logAuth("RETRY_TOKEN_SOLE_AUTH", undefined, `Retry token accepted as sole auth, bypassing handshake challenge (correlationId: ${payload.correlation_id})`);
        return proceed({
          correlationId: payload.correlation_id,
          cleared: true,
          clearanceMultiplier: gate.clearanceMultiplier,
          plainVariant: false,
          retryBloomFilter: payload.bloom_filter,
        });
      }
      rejection = "already_consumed_or_guard_missing";
    }
  }

  logAuth("RETRY_TOKEN_REJECTED", ipHash, `Retry token rejected (reason: ${rejection})`);
  return halt(reject(rc, { status: 410, body: { error: "retry_token_invalid" }, detail: `Retry token rejected: ${rejection}`, ipHash }));
}

async function authorizeSessionToken({ rc, ring, admission, request }: AuthInput): Promise<Outcome<Authorization>> {
  const { ip, ipHash, gate } = admission;
  const { body } = request;
  const deny = (event: string, detail: string, httpDetail: string) => {
    logAuth(event, ipHash, detail);
    return halt(verificationFailed(rc, httpDetail, ipHash));
  };
  const demandVerification = (detail: string, httpDetail: string) => {
    logSecurity("TURNSTILE_REQUIRED", ipHash, detail);
    return halt(verificationRequired(rc, httpDetail, ipHash));
  };

  const session = await verifySession(ring, body.token, ip);
  if (!session) return deny("TOKEN_INVALID", "Session token verification failed (invalid signature or expired)", "Token verification failed");
  const { payload, secret } = session;
  logAuth("TOKEN_VERIFIED", undefined, `Session token verified (cv: ${payload.cv}, tag: ${payload.recipe.tag})`);

  const cleared = await verifyClearance(ring, body.clearance, ip);
  if (!cleared && gate.requireClearance) return demandVerification("Quarantine requires Turnstile clearance", "Quarantine clearance required");

  if (!(await consumeNonce(caches.default, payload.nonce, ipHash, secret))) {
    return deny("TOKEN_REPLAY", "Session nonce replay attack detected (nonce already consumed)", "Token replay");
  }
  logAuth("NONCE_CONSUMED", undefined, `Nonce ${payload.nonce} consumed`);

  const challengeKey = await deriveChallengeKey(secret, payload.nonce);
  if ((await computeAnswer(challengeKey, proofCommitment(body.proof))) !== body.answer) {
    return deny("CHALLENGE_MISMATCH", "Challenge answer mismatch", "Challenge answer mismatch");
  }
  logAuth("CHALLENGE_VERIFIED", undefined, "Challenge answer verified");

  const plainVariant = body.proof?.variant === "plain";
  if (cleared) {
    logSecurity("CLEARANCE_VERIFIED", undefined, "Turnstile clearance token verified");
    return proceed({ correlationId: crypto.randomUUID(), cleared: true, clearanceMultiplier: gate.clearanceMultiplier, plainVariant, retryBloomFilter: null });
  }
  if (!(await verifyProofVector(payload.nonce, payload.recipe, body.proof))) {
    return demandVerification(`Environment probe verification failed (variant: ${body.proof?.variant || "none"})`, "Env probe failed");
  }
  if (plainVariant) return demandVerification("Clone fallback variant detected", "Clone fallback variant");
  return proceed({ correlationId: crypto.randomUUID(), cleared: false, clearanceMultiplier: 1, plainVariant, retryBloomFilter: null });
}

export function authorize(input: AuthInput): Promise<Outcome<Authorization>> {
  return input.request.body.retryToken ? authorizeRetryToken(input) : authorizeSessionToken(input);
}
