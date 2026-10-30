import { t } from "../../i18n";
import { detectSourceLanguage, normalizeDetectedCode } from "../../utils/detect";
import { entriesToGlossary } from "../../utils/dictionary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { completeTranslateJob, isBatchBlocking, LocalizedError, TranslateJobResponse, WorkerRequestError } from "../../api/translation";
import { applySdhStripping } from "../../lib/subtitle/extraction/sdh";
import { maskLyrics } from "../../lib/subtitle/extraction/lyrics";
import { countScenes } from "../../lib/subtitle/common/sceneThreads";
import { supportsContext } from "../../components/contextInput";
import { CONTEXT_MAX_CHARS, validateContext } from "../../utils/context";
import { assistFor } from "./assistScope";
import type { SubtitleFile } from "./state";
import { hasReusableTranslation, translationSignature } from "./translationSignature";
import { requestedSourceLang } from "./sourceLanguage";
import type { LogChannel } from "../../components/logPanel";
import type { WorkspaceContext } from "./context";

export interface RunContext {
  contextText?: string;
  contextNeedsTranslation: boolean;
}

export interface FileFailure {
  filename: string;
  error: unknown;
}

export interface RunOutcome {
  actualProvider: string;
  translatedFiles: number;
  failures: FileFailure[];
}

export async function prepareRunContexts(ctx: WorkspaceContext, sourceLang: string): Promise<Map<string, RunContext>> {
  const { state } = ctx;
  const byText = new Map<string, RunContext>();
  const contexts = new Map<string, RunContext>();
  for (const file of state.files) {
    const text = assistFor(state, file).contextText;
    if (!text.trim() || !supportsContext(state.provider)) {
      contexts.set(file.id, { contextNeedsTranslation: false });
      continue;
    }
    if (!byText.has(text)) {
      const validation = await validateContext(text, sourceLang);
      if (text === state.contextText) {
        ctx.assist.context.setHint(
          validation.needsTranslation
            ? t("context.willTranslate", { code: validation.detectedCode || "?" })
            : validation.truncated ? t("context.tooLong", { max: CONTEXT_MAX_CHARS }) : ""
        );
      }
      byText.set(text, { contextText: validation.text || undefined, contextNeedsTranslation: validation.needsTranslation });
    }
    contexts.set(file.id, byText.get(text)!);
  }
  return contexts;
}

async function languageForSdh(file: SubtitleFile, sourceLang: string): Promise<string> {
  if (sourceLang !== AUTO_DETECT_CODE) return sourceLang;
  const detected = await detectSourceLanguage(file.cues);
  return detected?.reliable ? normalizeDetectedCode(detected.code) : sourceLang;
}

async function toWireCues(file: SubtitleFile, sourceLang: string, stripSdh: boolean, skipLyrics: boolean) {
  const { cues } = applySdhStripping(file.cues, await languageForSdh(file, sourceLang), stripSdh);
  return maskLyrics(cues.map((cue) => ({ ...cue, text: cue.text.replace(/\n+/g, " ").trim() })), skipLyrics);
}

const yesNo = (value: boolean): string => (value ? "yes" : "no");

const lyricsOnlyJob = (sourceLang: string): TranslateJobResponse => ({
  success: true,
  resolved_source_lang: sourceLang,
  cues: [],
  approx_splits: [],
  missing_count: 0,
  missing_cues: [],
  quality_warnings: [],
});

async function translateFile(ctx: WorkspaceContext, file: SubtitleFile, log: LogChannel, signal: AbortSignal, runContext: RunContext): Promise<TranslateJobResponse | null> {
  const { state } = ctx;
  const sourceLang = requestedSourceLang(state, file);
  const targetLang = state.targetLang;
  const glossary = entriesToGlossary(assistFor(state, file).glossaryEntries);
  const { retained: cues, restore } = await toWireCues(file, sourceLang, state.sdhEnabled, state.skipLyrics);
  log.append(
    `00:00:00.000 [INFO] [Job] engine=${state.provider} source=${sourceLang} target=${targetLang} scenes=${countScenes(cues, state.sceneSeconds)} cues=${cues.length} context=${yesNo(Boolean(runContext.contextText))} glossary=${yesNo(Object.keys(glossary).length > 0)}`
  );
  const job: TranslateJobResponse = cues.length === 0 ? lyricsOnlyJob(sourceLang) : await completeTranslateJob(
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
      onLog: log.append,
      onProgress: (chunk) => {
        if (cues.length > 0 && chunk.cues) {
          ctx.progress.report(chunk.cues.filter((cue) => cue.translation !== null).length);
        }
      },
      signal,
    }
  );
  if (!job.success) return null;
  job.cues = restore(job.cues);
  return job;
}

function storeResult(state: WorkspaceContext["state"], file: SubtitleFile, job: TranslateJobResponse): void {
  file.jobResult = job;
  file.translationSignature = translationSignature(state, file);
  file.renderMode = state.outputMode;
  file.stacking = state.stackingOrder;
  file.musicTopAlign = state.musicTopAlign;
  file.creditEnabled = state.creditEnabled;
}

export async function translateAllFiles(ctx: WorkspaceContext, signal: AbortSignal, runContexts: ReadonlyMap<string, RunContext>): Promise<RunOutcome> {
  const { state } = ctx;
  const outcome: RunOutcome = { actualProvider: state.provider, translatedFiles: 0, failures: [] };

  for (const file of state.files) {
    const log = ctx.log.section(file.filename);
    if (hasReusableTranslation(state, file)) {
      log.append("[info] Reused existing translation");
      continue;
    }
    ctx.progress.beginFile(file.filename);
    try {
      const job = await translateFile(ctx, file, log, signal, runContexts.get(file.id)!);
      if (!job) throw new LocalizedError(`translation empty: ${file.filename}`, "error.translationEmpty", { name: file.filename });
      storeResult(state, file, job);
      ctx.progress.completeFile(file.cues.length);
      if (job.provider) outcome.actualProvider = job.provider;
      outcome.translatedFiles += 1;
      if (job.halt_reason) outcome.failures.push({ filename: file.filename, error: new WorkerRequestError("worker resource limit hit at scene level", { code: job.halt_reason }) });
    } catch (error) {
      file.jobResult = null;
      file.translationSignature = null;
      outcome.failures.push({ filename: file.filename, error });
      log.append(signal.aborted ? "[info] Job cancelled by user." : `[error] ${error instanceof Error ? error.message : String(error)}`);
      if (signal.aborted || isBatchBlocking(error)) break;
    }
  }
  return outcome;
}
