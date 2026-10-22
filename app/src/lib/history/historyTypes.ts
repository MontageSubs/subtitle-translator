import type { SubtitleFormat, OutputMode, BilingualStacking, CueLayout, Glossary } from "../subtitle/types";
import type { SourceFormat } from "../subtitle/extraction/encoding";
import type { AnCornerOrDefault } from "../subtitle/formats/topAlign";
import type { CueMeta } from "../subtitle/formats/cueMeta";

export type TranslationEngine = "nmt" | "llm";

export interface HistoryCue extends Omit<CueMeta, "topAlign"> {
  id: number;
  start_ms: number;
  end_ms: number;
  sourceText: string;
  translatedText: string;
  is_music?: boolean;
  verbatim?: boolean;
  topAlignOverride?: AnCornerOrDefault;
  an?: AnCornerOrDefault;
}

export interface HistorySubtitle {
  id: string;
  sourceFilename?: string;
  filename: string;
  format: SubtitleFormat;
  outputMode: OutputMode;
  stacking: BilingualStacking;
  musicTopAlign?: boolean;
  cueLayout?: CueLayout;
  credit?: boolean;
  cues: HistoryCue[];
  sourceFormat?: SourceFormat;
  originFormat?: SubtitleFormat;
  sourceLayout?: string;
  relativePath?: string;
  sourceLang?: string;
  incomplete?: boolean;
}

export interface HistoryJobHead {
  id: string;
  historyId?: string;
  engine: TranslationEngine;
  provider?: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  glossary?: Glossary;
  contextText?: string;
  caseSensitiveTerms?: boolean;
  incomplete?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryJobBody {
  subtitles: HistorySubtitle[];
  stripSdh?: boolean;
  skipLyrics?: boolean;
  fullWidthPunctuation?: boolean;
  keepTerminalPunctuation?: boolean;
  sceneSeconds?: number;
  elapsedMs?: number;
}

export type HistoryJob = HistoryJobHead & HistoryJobBody;

export interface HistorySummary extends HistoryJobHead {
  cueCount: number;
  files: { id: string; name: string; incomplete?: boolean }[];
}
