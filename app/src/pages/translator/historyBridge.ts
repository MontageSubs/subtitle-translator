import { HistorySubtitle } from "../../lib/history/history";
import { buildHistoryCues, historyCuesToCues } from "../../lib/history/historyRender";
import { buildSourceLayout } from "../../lib/history/sourceLayout";
import { indexCuesById } from "./outputRender";
import { WorkspaceState } from "./state";

export function buildHistorySubtitles(state: WorkspaceState): HistorySubtitle[] {
  return state.files.flatMap((file) => {
    if (!file.jobResult) return [];
    const cues = buildHistoryCues(file.jobResult.cues, indexCuesById(file), file.topAlignOverrides);
    return [{
      id: file.id,
      sourceFilename: file.filename,
      translatedFilename: file.downloadFilename,
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
    }];
  });
}
