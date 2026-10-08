import type { BilingualCue } from "../types";
import type { TargetRules, WordCutter } from "../languages/types";

export interface ApproxSplit {
  unit_id: number;
  cues: number[];
  method: string;
}

export interface QualityWarning {
  cue_id: number;
  cps: number;
  over_cps: boolean;
  over_length: boolean;
}

export interface MergeResult {
  cues: BilingualCue[];
  approx_splits: ApproxSplit[];
  missing_count: number;
  missing_cues: number[];
  quality_warnings: QualityWarning[];
}

export interface SplitContext {
  rules: TargetRules;
  anchorsEnabled: boolean;
  cutter: WordCutter | null;
}

export type SplitMethod =
  | "single"
  | "marker_boundary"
  | "mixed_boundary"
  | "original_boundary"
  | "inferred_punctuation"
  | "word_boundary";

export type ProtectedSpan = readonly [start: number, end: number];
