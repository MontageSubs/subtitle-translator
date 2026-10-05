import { HistorySubtitle } from "../../lib/history/history";
import { buildHistoryCues } from "../../lib/history/historyRender";
import { indexCuesById } from "./outputRender";
import { WorkspaceState } from "./state";

export function buildHistorySubtitles(state: WorkspaceState): HistorySubtitle[] {
  return state.files.flatMap((file) => {
    if (!file.jobResult) return [];
    return [{
      id: file.id,
      sourceFilename: file.filename,
      translatedFilename: file.downloadFilename,
      filename: file.downloadFilename,
      format: state.outputFormat,
      outputMode: file.renderMode,
      stacking: file.stacking,
      musicTopAlign: file.musicTopAlign,
      cues: buildHistoryCues(file.jobResult.cues, indexCuesById(file), file.topAlignOverrides),
      sourceFormat: file.sourceFormat || undefined,
      relativePath: file.relativePath,
    }];
  });
}
