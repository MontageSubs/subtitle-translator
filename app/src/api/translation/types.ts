import { Recipe } from "../../utils/envProbe";
import { Cue, TranslatedCue } from "../../lib/subtitle/types";

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

export interface ApproxSplit {
  unit_id: number;
  cues: number[];
  method: string;
}

export interface TranslateJobResponse {
  success: boolean;
  resolved_source_lang: string;
  provider?: string;
  cues: TranslatedCue[];
  approx_splits: ApproxSplit[];
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

export interface InitEvent extends Partial<WorkerSessionPayload> {
  type: "init";
  retry_token?: string;
}

export interface LogEvent {
  type: "log";
  message: string;
}

export interface ResultChunkEvent {
  type: "result_chunk";
  data?: { cues?: TranslatedCue[]; resolved_source_lang?: string };
}

export interface ErrorEvent {
  type: "error";
  message?: string;
  error?: string;
  fatal?: boolean;
  trigger_turnstile?: boolean;
}

export interface ResultEvent extends Partial<WorkerSessionPayload>, Omit<TranslateJobResponse, "cues" | "approx_splits" | "quality_warnings"> {
  type: "result";
  approx_splits?: ApproxSplit[];
  quality_warnings?: QualityWarning[];
}

export type StreamEvent = InitEvent | LogEvent | ResultChunkEvent | ErrorEvent | ResultEvent;

export type LogHandler = (message: string) => void;
export type ProgressHandler = (chunk: TranslateJobResponse) => void;

export interface JobCallbacks {
  onLog?: LogHandler;
  onProgress?: ProgressHandler;
  signal?: AbortSignal;
}
