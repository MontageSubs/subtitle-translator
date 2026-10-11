import { t } from "../../i18n";
import { completeTranslateJob, TranslateJobResponse } from "../../api/translation";
import { applySdhStripping } from "../../lib/subtitle/extraction/sdh";
import { supportsContext } from "../../components/contextInput";
import { CONTEXT_MAX_CHARS, validateContext } from "../../utils/context";
import type { SubtitleFile } from "./state";
import { hasReusableTranslation, translationSignature, TranslationRequest } from "./translationSignature";
import type { WorkspaceContext } from "./context";

export interface RunContext {
  contextText?: string;
  contextNeedsTranslation: boolean;
}

export interface RunOutcome {
  resolvedSourceLang: string;
  actualProvider: string;
  translatedFiles: number;
}

export async function prepareRunContext(ctx: WorkspaceContext, sourceLang: string): Promise<RunContext> {
  const { state } = ctx;
  if (!state.contextText.trim() || !supportsContext(state.provider)) return { contextNeedsTranslation: false };
  const validation = await validateContext(state.contextText, sourceLang);
  ctx.assist.context.setHint(
    validation.needsTranslation
      ? t("context.willTranslate", { code: validation.detectedCode || "?" })
      : validation.truncated ? t("context.tooLong", { max: CONTEXT_MAX_CHARS }) : ""
  );
  return { contextText: validation.text || undefined, contextNeedsTranslation: validation.needsTranslation };
}

function toWireCues(file: SubtitleFile, sourceLang: string, stripSdh: boolean) {
  const { cues } = applySdhStripping(file.cues, sourceLang, stripSdh);
  return cues.map((cue) => ({ ...cue, text: cue.text.replace(/\n+/g, " ").trim() }));
}

export async function translateAllFiles(ctx: WorkspaceContext, signal: AbortSignal, request: TranslationRequest, runContext: RunContext): Promise<RunOutcome> {
  const { state } = ctx;
  const { sourceLang, targetLang, glossary } = request;
  const outcome: RunOutcome = { resolvedSourceLang: sourceLang, actualProvider: state.provider, translatedFiles: 0 };
  let sourceResolved = false;

  const noteResolvedSource = (job: TranslateJobResponse): void => {
    if (sourceResolved) return;
    outcome.resolvedSourceLang = job.resolved_source_lang || sourceLang;
    sourceResolved = true;
  };

  for (const [index, file] of state.files.entries()) {
    ctx.progress.beginFile(index, file.filename);
    if (hasReusableTranslation(state, file, request)) {
      ctx.log.append(`[info] Reused existing translation: ${file.filename}`);
      ctx.progress.completeFile(file.cues.length);
      noteResolvedSource(file.jobResult!);
      continue;
    }
    const cues = toWireCues(file, sourceLang, state.sdhEnabled);
    const job: TranslateJobResponse = await completeTranslateJob(
      {
        cues,
        glossary,
        source: sourceLang,
        target: targetLang,
        provider: state.provider,
        sceneChangeSeconds: state.sceneSeconds,
        caseSensitiveTerms: state.caseSensitiveTerms,
        ...runContext,
      },
      {
        onLog: ctx.log.append,
        onProgress: (chunk) => {
          if (cues.length > 0 && chunk.cues) {
            ctx.progress.report(chunk.cues.filter((cue) => cue.translation !== null).length, cues.length);
          }
        },
        signal,
      }
    );
    ctx.progress.completeFile(cues.length);
    if (!job.success) {
      ctx.log.append(`[warn] ${t("error.translationEmpty", { name: file.filename })}`);
      file.jobResult = null;
      file.translationSignature = null;
      continue;
    }
    file.jobResult = job;
    file.translationSignature = translationSignature(state, file, request);
    file.renderMode = state.outputMode;
    file.stacking = state.stackingOrder;
    file.musicTopAlign = state.musicTopAlign;
    noteResolvedSource(job);
    if (job.provider) outcome.actualProvider = job.provider;
    outcome.translatedFiles += 1;
  }
  return outcome;
}
