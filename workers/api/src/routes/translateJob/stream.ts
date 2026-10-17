import { languageTag } from "../../translation/providerLanguages";
import { settingsFor } from "../../config/settings";
import type { Emit } from "../../http/ndjson";
import type { RequestContext } from "../../http/context";
import { countCompletedJob, countJobError } from "../../counters/jobCounters";
import { createEngineLog } from "../../logging/engineLog";
import { errorMessage } from "../../logging/fault";
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
      { maxChars: settingsFor(env).maxBatchChars, startedAt: rc.startedAt, clientUserAgent: rc.request.headers.get("User-Agent") || undefined, onLog: createEngineLog((message) => void emit({ type: "log", message })) }
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
    rc.log.settle({
      status: 200,
      ipHash: plan.ipHash,
      fault: true,
      detail: () =>
        `translate job failed (error_code: ${code}, origin: ${isProviderErrorCode(code) ? "provider" : "self"}, attempt: ${request.body.attemptNumber || 1}, retry: ${request.body.isRetry === true}, cues: ${request.cues.length}): ${errorMessage(error)}`,
    });
    await emit({ type: "error", message: "translate job failed" });
    return;
  }

  const success = outcome !== null;
  const summary = outcome?.summary ?? { approx_splits: [], missing_count: 0, missing_cues: [], quality_warnings: [] };
  rc.log.settle({
    status: 200,
    detail: () => {
      if (!success) return "extraction failed";
      const missing = summary.missing_count > 0 ? `, missing: ${summary.missing_count}${isDebugEnabled(2) ? ` [${summary.missing_cues.join(", ")}]` : ""}` : "";
      return `translated ${plan.cues.length} cues via ${outcome!.provider}${missing}`;
    },
  });
  if (success && plan.counted) countCompletedJob(ctx, env);

  await emit({
    type: "result",
    success,
    resolved_source_lang: outcome?.resolvedSourceLang ?? request.source,
    ...summary,
    provider: outcome?.provider ?? request.providerName,
    retry_token: plan.retryToken,
  });
}
