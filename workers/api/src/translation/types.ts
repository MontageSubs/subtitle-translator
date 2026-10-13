import type { Env } from "../config/env";
import type { BilingualCue, Chapter, Cue, Glossary, Unit } from "../subtitle/types";
import type { ApproxSplit, QualityWarning } from "../subtitle/merge";

export interface EngineInput {
  cues: Cue[];
  units: Unit[];
  chapters: Chapter[];
}

export type UnitTranslations = Map<number, string>;

export interface MergeSummary {
  approx_splits: ApproxSplit[];
  missing_count: number;
  missing_cues: number[];
  quality_warnings: QualityWarning[];
}

export interface TranslationChunk {
  cues: BilingualCue[];
  resolvedSourceLang: string;
  provider: string;
  summary?: MergeSummary;
}

export interface ProviderJob {
  sourceLang: string;
  targetLang: string;
  glossary: Glossary;
  contextText?: string;
  contextNeedsTranslation?: boolean;
  maxChars: number;
  startedAt: number;
  clientUserAgent?: string;
  onLog: (message: string) => void;
  env: Env;
}

export interface TranslationProvider {
  readonly id: string;
  translate(input: EngineInput, job: ProviderJob): AsyncGenerator<TranslationChunk, void, unknown>;
}
