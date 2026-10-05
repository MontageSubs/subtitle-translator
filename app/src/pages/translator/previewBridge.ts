import { openPreviewModal, PreviewApplyResult } from "../../components/preview";
import { updateHistoryJob } from "../../lib/history/history";
import { AnCornerOrDefault } from "../../lib/subtitle/formats/topAlign";
import { entriesToGlossary, DictionaryEntry } from "../../utils/dictionary";
import { buildHistorySubtitles } from "./historyBridge";
import { buildPreviewCards, renderFileOutput, renderSourceText, renderTranslatedText } from "./outputRender";
import type { SubtitleFile } from "./state";
import type { WorkspaceContext } from "./context";

interface PreviewEdits {
  edits: Map<number, string>;
  contextText?: string;
  glossaryEntries?: DictionaryEntry[];
  positionEdits?: Map<number, AnCornerOrDefault>;
}

function applyPreviewEdits(ctx: WorkspaceContext, file: SubtitleFile, { edits, contextText, glossaryEntries, positionEdits }: PreviewEdits): PreviewApplyResult {
  const { state } = ctx;
  if (!file.jobResult) return {};
  file.jobResult = {
    ...file.jobResult,
    cues: file.jobResult.cues.map((cue) => (edits.has(cue.id) ? { ...cue, translation: edits.get(cue.id)! } : cue)),
  };
  positionEdits?.forEach((value, cueId) => file.topAlignOverrides.set(cueId, value));
  if (contextText !== undefined) ctx.assist.context.setText(contextText);
  if (glossaryEntries !== undefined) {
    state.glossaryEntries = glossaryEntries;
    ctx.assist.glossary.setEntries(glossaryEntries);
  }
  void ctx.result.present();
  const rawSrt = renderFileOutput(state, file, ctx.language.targetCode())?.rendered;

  if (state.currentHistoryId) {
    updateHistoryJob(state.currentHistoryId, {
      subtitles: buildHistorySubtitles(state),
      ...(contextText !== undefined && { contextText }),
      ...(glossaryEntries !== undefined && { glossary: entriesToGlossary(glossaryEntries) }),
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

  openPreviewModal(translatedText, sourceText, buildPreviewCards(state, file, targetLang), {
    onApply: (edits, contextText, glossaryEntries, positionEdits) => applyPreviewEdits(ctx, file, { edits, contextText, glossaryEntries, positionEdits }),
    sceneSeconds: state.sceneSeconds,
    initialContext: state.contextText,
    provider: state.provider,
    initialGlossary: state.glossaryEntries,
    sourceFilename: file.filename,
    translatedFilename: file.downloadFilename,
    sourceLang: ctx.language.sourceCode(),
    targetLang,
    outputMode: file.renderMode,
    cueLayout: state.cueLayout,
    trueOriginalSourceText: file.rawSourceText,
    trueOriginalSourceBytes: file.rawSourceBytes,
  });
}
