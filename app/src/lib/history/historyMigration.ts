import type { Cue } from "../subtitle/types";
import { applyCueMeta } from "../subtitle/formats/cueMeta";
import { parseAnTag } from "../subtitle/formats/topAlign";
import { packCueMeta } from "./cueMetaCodec";
import type { HistoryCue, HistoryJob, HistorySubtitle } from "./historyTypes";

export const isLegacyJob = (raw: any): boolean => !Number.isInteger(raw?.schema) || raw.schema < 2;

function upgradeCue(raw: any): HistoryCue {
  const { id, start_ms, end_ms, sourceText, translatedText, is_music, verbatim, topAlignOverride } = raw;
  const legacy: Cue = applyCueMeta(
    { id, start_ms, end_ms, text: sourceText, topAlign: raw.topAlign || parseAnTag(raw.position || raw.extra?.position || ""), cueSettings: raw.cueSettings },
    raw.extra
  );
  return { id, start_ms, end_ms, sourceText, translatedText, is_music, verbatim, topAlignOverride, ...packCueMeta(legacy) };
}

function upgradeSubtitle(raw: any, fallbackSourceFilename: string | undefined): HistorySubtitle {
  const { translatedFilename, rawHeader, rawStyles, template, extra, cues, ...kept } = raw;
  return { ...kept, filename: translatedFilename || raw.filename, sourceFilename: raw.sourceFilename || fallbackSourceFilename || raw.filename, cues: cues.map(upgradeCue) };
}

export function upgradeLegacyJob(raw: any): HistoryJob {
  const { schema, sourceFilename, translatedFilename, extra, subtitles, ...kept } = raw;
  return { ...kept, subtitles: subtitles.map((subtitle: any, index: number) => upgradeSubtitle(subtitle, index === 0 ? sourceFilename : undefined)) };
}
