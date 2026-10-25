import type { Env } from "../config/env";
import type { EngineTrace } from "../logging/engineTrace";
import type { BilingualCue, Chapter, Cue, Glossary, Unit } from "../subtitle/types";
import type { ApproxSplit } from "../subtitle/merge";

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
  subrequestLimit: number;
  startedAt: number;
  clientUserAgent?: string;
  trace: EngineTrace | null;
  env: Env;
}

export interface TranslationProvider {
  readonly id: string;
  requestChars(maxChars: number): number;
  translate(input: EngineInput, job: ProviderJob): AsyncGenerator<TranslationChunk, void, unknown>;
}
