import { formatSubtitleTime } from "../../lib/subtitle/formats/formatTime";
import { renderSubtitle, buildTranslatedFilename } from "../../lib/subtitle/formats/registry";
import { prepareTranslation } from "../../lib/subtitle/postprocess/lineWrap";
import type { PunctuationStyle } from "../../lib/subtitle/postprocess/punctuationStyle";
import { resolveDisplayOriginal, cleanPositionTags } from "../../lib/subtitle/postprocess/displayText";
import { effectiveCueLayout, resolveCuePlacement } from "../../lib/subtitle/formats/cueLayout";
import { encodeSubtitleText } from "../../lib/subtitle/extraction/encoding";
import { PreviewCard, withCreditCard } from "../../components/preview";
import { WorkspaceState, SubtitleFile } from "./state";

const punctuationStyleOf = (state: WorkspaceState): PunctuationStyle => ({
  fullWidth: state.fullWidthPunctuation,
  keepTerminators: state.keepTerminalPunctuation,
});

export interface RenderedFile {
  rendered: string;
  blob: Blob;
  filename: string;
}

const DEFAULT_ENCODING = { encoding: "utf-8", bom: false, newline: "lf" as const };

export function resolveFileSourceLang(state: WorkspaceState, file: SubtitleFile): string {
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
    credit: file.creditEnabled,
    sourceLang: resolveFileSourceLang(state, file),
    targetLang,
    cueLayout: state.cueLayout,
    punctuation: punctuationStyleOf(state),
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
  const layout = { cueLayout: effectiveCueLayout(state.outputFormat, state.cueLayout), mode: file.renderMode, stacking: file.stacking };
  const cards: PreviewCard[] = file.jobResult.cues.map((cue) => {
    const original = originalById.get(cue.id);
    const topAlign = resolveCuePlacement(layout, original, cue.is_music, file.musicTopAlign, file.topAlignOverrides.get(cue.id));
    const rawTarget = cleanPositionTags(cue.translation || "");
    const target = prepareTranslation(rawTarget, file.renderMode, layout.cueLayout, targetLang, punctuationStyleOf(state));
    const source = resolveDisplayOriginal(cue.text, original?.text, !!cue.translation);
    return {
      id: cue.id,
      start: formatSubtitleTime(cue.start_ms, state.outputFormat),
      end: formatSubtitleTime(cue.end_ms, state.outputFormat),
      source,
      target: cue.verbatim ? source : target,
      locked: cue.verbatim,
      start_ms: cue.start_ms,
      end_ms: cue.end_ms,
      sourceLang,
      targetLang,
      leaked: leakedIds.has(cue.id),
      topAlignAn: topAlign?.an ?? 2,
    };
  });
  return withCreditCard(cards, {
    enabled: file.creditEnabled,
    cues: file.jobResult.cues,
    originalById,
    format: state.outputFormat,
    sourceLang,
    targetLang,
  });
}
