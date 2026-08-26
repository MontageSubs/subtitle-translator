export interface Cue {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
  position?: string;
  cueSettings?: string;
  identifier?: string;
  vttHeader?: string;
  leadingBlocks?: string[];
  trailingBlocks?: string[];
}

export type SubtitleFormat = "srt" | "vtt";

export type OutputMode = "bilingual" | "monolingual";
export type BilingualStacking = "translation_top" | "original_top";

export type Glossary = Record<string, string>;
