import { languageTag } from "../../translation/providerLanguages";
import { settingsFor } from "../../config/settings";
import type { Emit } from "../../http/ndjson";
import type { RequestContext } from "../../http/context";
import { countCompletedJob, countJobError } from "../../counters/jobCounters";
import { createEngineLog } from "../../logging/engineLog";
import { describeError } from "../../logging/fault";
import { logRequest } from "../../logging/requestLog";
import { isDebugEnabled } from "../../logging/level";
import { runTranslation } from "../../translation/job";
import type { MergeSummary } from "../../translation/types";
import type { IssuedSession } from "../../security/session/token";
import type { Recipe } from "../../security/clientCheck/recipe";
import type { Authorization } from "./authorization";
import { classifyPipelineError, isProviderErrorCode } from "./errorCodes";
import type { ParsedRequest } from "./request";
import type { ProtocolCue } from "../../http/protocol";

export interface StreamPlan {
  rc: RequestContext;
  ipHash: string;
  request: ParsedRequest;
  authorization: Authorization;
  cues: ProtocolCue[];
  chars: number;
  sourceLang: string;
  targetLang: string;
  contextText?: string;
  contextNeedsTranslation: boolean;
  retryToken?: string;
  counted: boolean;
  firstFrame: IssuedSession & { recipe: Recipe };
}

interface Outcome {
  summary: MergeSummary;
  provider: string;
  resolvedSourceLang: string;
}

function logJobResult(plan: StreamPlan, outcome: Outcome | null): void {
  const { rc, request, cues } = plan;
  if (!outcome) {
    logRequest(rc, "rejected", `reason=extraction_failed cues=${cues.length} chars=${plan.chars}`, plan.ipHash);
    return;
  }
  const { summary } = outcome;
  const failedIds = isDebugEnabled(2) && summary.missing_count > 0 ? ` failed_ids=${summary.missing_cues.join(",")}` : "";
  logRequest(
    rc,
    "ok",
    `cues=${cues.length} translated=${cues.length - summary.missing_count} failed=${summary.missing_count} chars=${plan.chars} provider=${outcome.provider} lang=${outcome.resolvedSourceLang}>${plan.targetLang} attempt=${request.body.attemptNumber || 1} retry=${request.body.isRetry === true} verified=${plan.authorization.cleared} splits=${summary.approx_splits.length} warns=${summary.quality_warnings.length}${failedIds}`,
    plan.ipHash
  );
}

export async function streamTranslation(plan: StreamPlan, emit: Emit): Promise<void> {
  const { rc, request, authorization, firstFrame } = plan;
  const { env, ctx } = rc;

  await emit({
    type: "init",
    token: firstFrame.token,
    challengeKey: firstFrame.challengeKey,
    nonce: firstFrame.nonce,
    recipe: firstFrame.recipe,
    retry_token: plan.retryToken,
    correlation_id: authorization.correlationId,
    worker_version: rc.workerVersion,
  });

  let outcome: Outcome | null = null;
  try {
    const chunks = runTranslation(
      env,
      {
        cues: plan.cues,
        glossary: request.glossary,
        sourceLang: plan.sourceLang,
        targetLang: plan.targetLang,
        providerName: request.providerName,
        sceneChangeSeconds: request.body.sceneChangeSeconds,
        caseSensitiveTerms: request.body.caseSensitiveTerms,
        contextText: plan.contextText,
        contextNeedsTranslation: plan.contextNeedsTranslation,
        punctuation: {
          fullWidth: request.body.fullWidthPunctuation === true,
          keepTerminators: request.body.keepTerminalPunctuation === true,
        },
      },
      { maxChars: settingsFor(env).maxBatchChars, startedAt: rc.startedAt, clientUserAgent: rc.request.headers.get("User-Agent") || undefined, onLog: createEngineLog(settingsFor(env).streamLog ? (message) => void emit({ type: "log", message }) : null) }
    );

    for await (const chunk of chunks) {
      const resolvedSourceLang = chunk.resolvedSourceLang ? languageTag(request.providerName, chunk.resolvedSourceLang) : request.source;
      if (chunk.summary) outcome = { summary: chunk.summary, provider: chunk.provider, resolvedSourceLang };
      if (chunk.cues.length > 0) {
        await emit({ type: "result_chunk", data: { cues: chunk.cues, resolved_source_lang: resolvedSourceLang, provider: chunk.provider } });
      }
    }
  } catch (error) {
    const code = classifyPipelineError(error, request.providerName);
    countJobError(ctx, env, code);
    logRequest(
      rc,
      "failed",
      `code=${code} origin=${isProviderErrorCode(code) ? "provider" : "self"} provider=${request.providerName} attempt=${request.body.attemptNumber || 1} retry=${request.body.isRetry === true} cues=${request.cues.length} chars=${plan.chars} error=${describeError(error)}`,
      plan.ipHash
    );
    await emit({ type: "error", message: "translate job failed" });
    return;
  }

  const success = outcome !== null;
  const summary = outcome?.summary ?? { approx_splits: [], missing_count: 0, missing_cues: [], quality_warnings: [] };
  if (success && plan.counted) countCompletedJob(ctx, env);
  logJobResult(plan, outcome);

  await emit({
    type: "result",
    success,
    resolved_source_lang: outcome?.resolvedSourceLang ?? request.source,
    ...summary,
    provider: outcome?.provider ?? request.providerName,
    retry_token: plan.retryToken,
  });
}
