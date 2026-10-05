import { Recipe } from "../../utils/envProbe";
import { Cue } from "../../utils/types";

export interface TranslatedCue {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
  translation: string | null;
  is_music?: boolean;
}

export interface QualityWarning {
  cue_id: number;
  cps: number;
  over_cps: boolean;
  over_length: boolean;
  leaked?: boolean;
}

export interface TranslateJobPayload {
  cues: Cue[];
  glossary: Record<string, string>;
  source: string;
  target: string;
  provider?: string;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
  contextText?: string;
  contextNeedsTranslation?: boolean;
  retryToken?: string;
  requestRetryToken?: boolean;
  isRetry?: boolean;
  attemptNumber?: number;
}

export interface TranslateJobResponse {
  success: boolean;
  resolved_source_lang: string;
  provider?: string;
  cues: TranslatedCue[];
  approx_splits: { unit_id: number; cues: number[]; method: string }[];
  missing_count: number;
  missing_cues: number[];
  quality_warnings: QualityWarning[];
  retry_token?: string;
}

export interface WorkerErrorPayload {
  error?: string;
  trigger_turnstile?: boolean;
}

export interface WorkerSessionPayload {
  token: string;
  challengeKey: string;
  nonce: number;
  recipe: Recipe;
}

export type LogHandler = (message: string) => void;
export type ProgressHandler = (chunk: TranslateJobResponse) => void;

export interface JobCallbacks {
  onLog?: LogHandler;
  onProgress?: ProgressHandler;
  signal?: AbortSignal;
}
