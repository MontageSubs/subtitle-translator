import { formatSubtitleTime } from "../../lib/subtitle/formats/formatTime";
import { renderSubtitle, buildTranslatedFilename } from "../../lib/subtitle/formats/registry";
import { wrapLine, shouldWrapTranslation } from "../../lib/subtitle/postprocess/lineWrap";
import { resolveDisplayOriginal, cleanPositionTags } from "../../lib/subtitle/postprocess/displayText";
import { resolveTopAlign } from "../../lib/subtitle/formats/topAlign";
import { encodeSubtitleText } from "../../lib/subtitle/extraction/encoding";
import { PreviewCard } from "../../components/preview";
import { WorkspaceState, SubtitleFile } from "./state";

export interface RenderedFile {
  rendered: string;
  blob: Blob;
  filename: string;
}

const DEFAULT_ENCODING = { encoding: "utf-8", bom: false, newline: "lf" as const };

function resolveFileSourceLang(state: WorkspaceState, file: SubtitleFile): string {
  return file.jobResult?.resolved_source_lang || state.sourceLang;
}

export function indexCuesById(file: SubtitleFile): Map<number, SubtitleFile["cues"][number]> {
  return new Map(file.cues.map((cue) => [cue.id, cue]));
}

export function renderTranslatedText(state: WorkspaceState, file: SubtitleFile, targetLang: string): string | null {
  if (!file.jobResult) return null;
  return renderSubtitle({
    format: state.outputFormat,
    cues: file.jobResult.cues,
    originalById: indexCuesById(file),
    mode: file.renderMode,
    stacking: file.stacking,
    musicTopAlign: file.musicTopAlign,
    topAlignOverrides: file.topAlignOverrides,
    sourceLang: resolveFileSourceLang(state, file),
    targetLang,
    cueLayout: state.cueLayout,
    equalBilingualSize: state.assEqualBilingualSize,
    assFontPreset: state.assFontPreset,
    assCustomPrimarySize: state.assCustomPrimarySize,
    assCustomSecondarySize: state.assCustomSecondarySize,
  });
}

export function renderSourceText(state: WorkspaceState, file: SubtitleFile, targetLang: string): string | null {
  if (!file.jobResult) return null;
  return renderSubtitle({
    format: state.outputFormat,
    cues: file.jobResult.cues.map((cue) => ({ ...cue, translation: null })),
    originalById: indexCuesById(file),
    mode: "monolingual",
    stacking: file.stacking,
    sourceLang: resolveFileSourceLang(state, file),
    targetLang,
    stampComment: false,
  });
}

export function renderFileOutput(state: WorkspaceState, file: SubtitleFile, targetLang: string): RenderedFile | null {
  const rendered = renderTranslatedText(state, file, targetLang);
  if (rendered === null || !file.jobResult) return null;
  const encoded = encodeSubtitleText(rendered, file.sourceFormat ?? DEFAULT_ENCODING);
  const blob = new Blob([encoded as BlobPart], { type: "text/plain;charset=utf-8" });
  const filename = buildTranslatedFilename(
    file.filename, state.outputFormat, resolveFileSourceLang(state, file), targetLang, file.renderMode, file.stacking
  );
  file.downloadFilename = filename;
  return { rendered, blob, filename };
}

export function buildPreviewCards(state: WorkspaceState, file: SubtitleFile, targetLang: string): PreviewCard[] {
  if (!file.jobResult) return [];
  const originalById = indexCuesById(file);
  const leakedIds = new Set(file.jobResult.quality_warnings?.filter((warning) => warning.leaked).map((warning) => warning.cue_id));
  const sourceLang = resolveFileSourceLang(state, file);
  const wrapTarget = shouldWrapTranslation(file.renderMode, state.cueLayout);
  return file.jobResult.cues.map((cue) => {
    const original = originalById.get(cue.id);
    const topAlign = resolveTopAlign(original, cue.is_music, file.musicTopAlign, file.topAlignOverrides.get(cue.id));
    const rawTarget = cleanPositionTags(cue.translation || "");
    const target = targetLang && rawTarget && wrapTarget ? wrapLine(rawTarget, targetLang, cue.end_ms - cue.start_ms) : rawTarget;
    return {
      id: cue.id,
      start: formatSubtitleTime(cue.start_ms, state.outputFormat),
      end: formatSubtitleTime(cue.end_ms, state.outputFormat),
      source: resolveDisplayOriginal(cue.text, original?.text, !!cue.translation),
      target,
      start_ms: cue.start_ms,
      end_ms: cue.end_ms,
      sourceLang,
      targetLang,
      leaked: leakedIds.has(cue.id),
      topAlignAn: topAlign?.an ?? 2,
    };
  });
}
