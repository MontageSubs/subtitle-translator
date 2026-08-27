import { ProtocolCue } from '../http/protocol';
import { Cue, Unit, Chapter, BilingualCue } from "../core/types";
import { ApproxSplit, QualityWarning } from "../core/bilingualMerge";
import { Env } from '../config/env';

export interface ProviderTranslateOptions {
  sourceLang: string;
  targetLang: string;
  glossary: Record<string, string>;
  contextText?: string;
  contextNeedsTranslation?: boolean;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
  maxChars: number;
  startedAt: number;
  clientUserAgent?: string;
  onLog?: (message: string) => void;
  env: Env;
}

export interface ProviderResultChunk {
  cues: BilingualCue[];
  approx_splits: ApproxSplit[];
  missing_count: number;
  missing_cues: number[];
  quality_warnings: QualityWarning[];
  resolvedSourceLang?: string;
}

export interface TranslationProvider {
  translate(
    units: Unit[],
    chapters: Chapter[],
    cues: Cue[],
    options: ProviderTranslateOptions
  ): AsyncGenerator<ProviderResultChunk, void, unknown>;
}
