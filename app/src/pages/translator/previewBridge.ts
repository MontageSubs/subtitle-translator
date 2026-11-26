import { openPreviewModal, PreviewApplyPayload, PreviewApplyResult } from "../../components/preview";
import { effectiveCueLayout, positionRule } from "../../lib/subtitle/formats/cueLayout";
import { isFrenchLanguage } from "../../lib/subtitle/postprocess/frenchTypography";
import { updateHistoryJob } from "../../lib/history/history";
import { toStoredGlossary } from "../../utils/glossary";
import { assistFor, jobAssist } from "./assistScope";
import { buildHistorySubtitles } from "./historyBridge";
import { buildPreviewCards, renderFileOutput, renderSourceText, renderTranslatedText, resolveFileSourceLang } from "./outputRender";
import { outputFormatOf, type SubtitleFile } from "./state";
import type { WorkspaceContext } from "./context";

function applyPreviewEdits(ctx: WorkspaceContext, file: SubtitleFile, { edits, contextText, glossaryEntries, positionEdits }: PreviewApplyPayload): PreviewApplyResult {
  const { state } = ctx;
  if (!file.jobResult) return {};
  const manualPunctuation = isFrenchLanguage(ctx.language.targetCode()) || undefined;
  file.jobResult = {
    ...file.jobResult,
    cues: file.jobResult.cues.map((cue) => (edits.has(cue.id) ? { ...cue, translation: edits.get(cue.id)!, manualPunctuation } : cue)),
  };
  positionEdits?.forEach((value, cueId) => file.topAlignOverrides.set(cueId, value));
  ctx.assist.applyToFile(file, { contextText, glossaryEntries });
  void ctx.result.present();
  const rawSrt = renderFileOutput(state, file, ctx.language.targetCode())?.rendered;

  if (state.currentHistoryId) {
    const assist = jobAssist(state);
    updateHistoryJob(state.currentHistoryId, {
      subtitles: buildHistorySubtitles(state),
      ...(contextText !== undefined && { contextText: assist.contextText }),
      ...(glossaryEntries !== undefined && { glossary: toStoredGlossary(assist.glossaryEntries) }),
    }).catch(() => {});
  }
  return { rawSrt };
}

export function openFilePreview(ctx: WorkspaceContext, fileId: string): void {
  const { state } = ctx;
  const file = state.files.find((candidate) => candidate.id === fileId);
  if (!file?.jobResult) return;
  const targetLang = ctx.language.targetCode();
  const translatedText = renderTranslatedText(state, file, targetLang);
  const sourceText = renderSourceText(state, file, targetLang);
  if (translatedText === null || sourceText === null) return;

  const format = outputFormatOf(state, file);
  const cueLayout = effectiveCueLayout(format, state.cueLayout);

  openPreviewModal(translatedText, sourceText, buildPreviewCards(state, file, targetLang), {
    onApply: (payload) => applyPreviewEdits(ctx, file, payload),
    sceneSeconds: state.sceneSeconds,
    initialContext: assistFor(state, file).contextText,
    provider: state.provider,
    initialGlossary: assistFor(state, file).glossaryEntries,
    sourceFilename: file.filename,
    translatedFilename: file.downloadFilename,
    sourceLang: resolveFileSourceLang(state, file),
    targetLang,
    outputMode: file.renderMode,
    cueLayout,
    outputFormat: format,
    positionRule: positionRule({ cueLayout, mode: file.renderMode, stacking: file.stacking }),
    trueOriginalSourceText: file.rawSourceText,
    trueOriginalSourceBytes: file.rawSourceBytes,
  });
}
