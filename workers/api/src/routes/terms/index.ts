import { settingsFor } from "../../config/settings";
import { ACTIVE_TTL_MS } from "../../config/timing";
import { readJsonBody } from "../../http/body";
import { noteClientVersion } from "../../http/clientVersion";
import type { RequestContext } from "../../http/context";
import { invalidRequest, jsonResponse, reject } from "../../http/responses";
import { countJobError } from "../../counters/jobCounters";
import { describeError } from "../../logging/fault";
import { logRequest } from "../../logging/requestLog";
import { trace } from "../../logging/trace";
import { admitRequest } from "../../security/admission";
import { generateRecipe } from "../../security/clientCheck/recipe";
import { flagMalformedRequest } from "../../security/gate";
import { meterWorkload } from "../../security/metering";
import { resolveSecretRing } from "../../security/secretRing";
import { storeNonce } from "../../security/session/nonce";
import { issueSession } from "../../security/session/token";
import { SubrequestBudget } from "../../translation/engine/budget";
import { limitsFor } from "../../translation/capabilities";
import { resolveProviderLanguage } from "../../translation/providerLanguages";
import { DEFAULT_PROVIDER, getProvider, isKnownProvider } from "../../translation/providers/registry";
import { translateTerms } from "../../translation/terms/run";
import { paRegionFor } from "../../upstream/paRegion";
import { authorizeSessionToken } from "../translateJob/authorization";
import { classifyPipelineError, isProviderErrorCode, MALFORMED_REQUEST_CODE } from "../translateJob/errorCodes";
import { totalChars } from "../translateJob/request";
import { parseTermsRequest, type TermsBody } from "./request";

const MAX_TERMS_CONTENT_CHARS = 20_000;

export async function handleTerms(rc: RequestContext): Promise<Response> {
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

  const body = await readJsonBody<TermsBody>(rc.request, settingsFor(env).maxBodyBytes);
  if (!body) return malformed("Failed to parse JSON body", "malformed_json");
  noteClientVersion(rc, body.clientVersion);
  const request = parseTermsRequest(body, env.TRANSLATION_PROVIDER || DEFAULT_PROVIDER);
  if (!request) return malformed("Invalid terms or missing source/target language", "invalid_fields");

  const { providerName, terms } = request;
  if (!isKnownProvider(providerName)) return reject(rc, { status: 400, body: { error: "unsupported_provider" }, reason: "unsupported_provider", ipHash });

  const sourceLang = resolveProviderLanguage(providerName, request.source);
  const targetLang = resolveProviderLanguage(providerName, request.target);
  if (!sourceLang || !targetLang) return reject(rc, { status: 400, body: { error: "unsupported_language" }, reason: "unsupported_language", ipHash });

  const chars = totalChars(terms);
  if (chars > MAX_TERMS_CONTENT_CHARS) return reject(rc, { status: 413, body: { error: "payload_too_large", maxContentChars: MAX_TERMS_CONTENT_CHARS }, reason: "payload_too_large", ipHash });

  const ring = await resolveSecretRing(env);
  const authorization = await authorizeSessionToken({ rc, ring, admission: admission.value, credentials: body });
  if (!authorization.ok) return authorization.response;
  const auth = authorization.value;

  const metered = await meterWorkload(rc, admission.value, { chars, cleared: auth.cleared, clearanceMultiplier: auth.clearanceMultiplier, plainVariant: auth.plainVariant, enforceQuota: true });
  if (!metered.ok) return metered.response;

  const recipe = generateRecipe();
  const session = await issueSession(ring, ACTIVE_TTL_MS, recipe, ip);
  await storeNonce(caches.default, session.nonce, ipHash, ring.current, Math.ceil(ACTIVE_TTL_MS / 1000));

  const limits = limitsFor(env, providerName);
  try {
    const outcome = await translateTerms(terms, {
      transport: getProvider(providerName).termTransport({
        env,
        sourceLang,
        targetLang,
        clientUserAgent: rc.request.headers.get("User-Agent") || undefined,
        paRegion: paRegionFor(rc.request),
      }),
      requestChars: limits.requestChars,
      budget: new SubrequestBudget(limits.subrequestLimit, () => undefined),
      startedAt: rc.startedAt,
    });
    logRequest(rc, "ok", `terms=${terms.length} translated=${outcome.results.length} failed=${outcome.failed.length} chars=${chars} provider=${providerName} lang=${request.source}>${request.target} verified=${auth.cleared}`, ipHash);
    return jsonResponse(rc, { ...session, recipe, worker_version: rc.workerVersion, provider: providerName, results: outcome.results, failed: outcome.failed }, 200);
  } catch (error) {
    const code = classifyPipelineError(error, providerName);
    countJobError(ctx, env, code);
    logRequest(rc, "failed", `code=${code} origin=${isProviderErrorCode(code) ? "provider" : "self"} provider=${providerName} terms=${terms.length} chars=${chars} error=${describeError(error)}`, ipHash);
    return jsonResponse(rc, { error: "terms_failed" }, 502);
  }
}
