import { settingsFor } from "../../config/settings";
import type { Emit } from "../../http/ndjson";
import type { RequestContext } from "../../http/context";
import { recordCompletedJob, recordJobError } from "../../telemetry/metrics";
import { errorMessage, logDiagnostic, logSecurity, reportError } from "../../telemetry/log";
import { runTranslation } from "../../translation/job";
import type { MergeSummary } from "../../translation/types";
import type { IssuedSession } from "../../security/session/token";
import type { Recipe } from "../../security/probe/recipe";
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
      },
      { maxChars: settingsFor(env).maxBatchChars, startedAt: rc.startedAt, clientUserAgent: rc.request.headers.get("User-Agent") || undefined, onLog: (message) => void emit({ type: "log", message }) }
    );

    for await (const chunk of chunks) {
      const resolvedSourceLang = chunk.resolvedSourceLang || request.source;
      if (chunk.summary) outcome = { summary: chunk.summary, provider: chunk.provider, resolvedSourceLang };
      if (chunk.cues.length > 0) {
        await emit({ type: "result_chunk", data: { cues: chunk.cues, resolved_source_lang: resolvedSourceLang, provider: chunk.provider } });
      }
    }
  } catch (error) {
    const code = classifyPipelineError(error, request.providerName);
    recordJobError(ctx, env, code);
    logDiagnostic(isProviderErrorCode(code) ? "provider" : "self", code, request.body.attemptNumber || 1, request.body.isRetry === true, request.cues.length);
    reportError("translate job failed", error);
    logSecurity("JOB_FAILED", plan.ipHash, `Translation job execution error: ${errorMessage(error)} (error_code: ${code})`);
    await emit({ type: "error", message: "translate job failed" });
    return;
  }

  const success = outcome !== null;
  const summary = outcome?.summary ?? { approx_splits: [], missing_count: 0, missing_cues: [], quality_warnings: [] };
  if (success && summary.missing_count > 0) {
    logSecurity("MISSING_CUES_AGGREGATED", undefined, `Translation returned ${summary.missing_count} missing cue(s): [${summary.missing_cues.join(", ")}]`);
  }
  if (success && plan.counted) recordCompletedJob(ctx, env);

  await emit({
    type: "result",
    success,
    resolved_source_lang: outcome?.resolvedSourceLang ?? request.source,
    ...summary,
    provider: outcome?.provider ?? request.providerName,
    retry_token: plan.retryToken,
  });
}
