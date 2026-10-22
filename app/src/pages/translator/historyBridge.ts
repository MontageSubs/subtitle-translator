import { HistorySubtitle } from "../../lib/history/history";
import { buildHistoryCues, historyCuesToCues } from "../../lib/history/historyRender";
import { buildSourceLayout } from "../../lib/history/sourceLayout";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { indexCuesById } from "./outputRender";
import { requestedSourceLang } from "./sourceLanguage";
import { SubtitleFile, WorkspaceState } from "./state";

function resolvedSourceLang(state: WorkspaceState, file: SubtitleFile): string | undefined {
  const lang = file.jobResult?.resolved_source_lang || requestedSourceLang(state, file);
  return lang === AUTO_DETECT_CODE ? undefined : lang;
}

export function buildHistorySubtitles(state: WorkspaceState): HistorySubtitle[] {
  return state.files.map((file) => {
    const translated = file.jobResult?.cues ?? file.cues.map((cue) => ({ id: cue.id, start_ms: cue.start_ms, end_ms: cue.end_ms, text: cue.text, translation: null }));
    const cues = buildHistoryCues(translated, indexCuesById(file), file.topAlignOverrides);
    return {
      id: file.id,
      sourceFilename: file.filename,
      filename: file.downloadFilename,
      format: state.outputFormat,
      outputMode: file.renderMode,
      stacking: file.stacking,
      musicTopAlign: file.musicTopAlign,
      cueLayout: state.cueLayout,
      credit: file.creditEnabled,
      cues,
      sourceFormat: file.sourceFormat || undefined,
      originFormat: file.originFormat,
      sourceLayout: file.rawSourceText ? buildSourceLayout(file.rawSourceText, historyCuesToCues(cues), file.originFormat) : undefined,
      relativePath: file.relativePath,
      sourceLang: resolvedSourceLang(state, file),
      incomplete: file.jobResult ? undefined : true,
    };
  });
}
