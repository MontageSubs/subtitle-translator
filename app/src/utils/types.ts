import { TopAlign } from '../lib/subtitle/topAlign';

export interface Cue {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
  topAlign?: TopAlign;
  cueSettings?: string;
  identifier?: string;
  vttHeader?: string;
  leadingBlocks?: string[];
  trailingBlocks?: string[];
  extra?: Record<string, unknown>;
}

export type SubtitleFormat = "srt" | "vtt" | "ass";

export type OutputMode = "bilingual" | "monolingual";
export type BilingualStacking = "translation_top" | "original_top";

export type Glossary = Record<string, string>;
