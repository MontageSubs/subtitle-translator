import { EngineEvent } from "./engineEvents";
import { Recipe } from "../../utils/clientCheck";
import { Cue, TranslatedCue } from "../../lib/subtitle/types";

export interface TranslationDelta {
  id: number;
  translation: string;
  is_music?: true;
}

interface QualityWarning {
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
  batchReport?: [number, number];
}

interface ApproxSplit {
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
  halt_reason?: "worker_limit";
}

export interface QuotaHint {
  window: "hour" | "day";
  percent: number;
}

export interface WorkerErrorPayload {
  error?: string;
  trigger_turnstile?: boolean;
  retry_at?: unknown;
  quota?: unknown;
  min_client_version?: string;
}

export interface ModelLimits {
  maxBatchChars: number;
  requestChars: number;
  subrequestLimit: number;
  initialBatchCap: number;
}

export interface WorkerCapabilities {
  defaultModel: string;
  models: Record<string, ModelLimits>;
}

export interface WorkerSessionPayload {
  token: string;
  challengeKey: string;
  nonce: number;
  recipe: Recipe;
}

interface InitEvent extends Partial<WorkerSessionPayload> {
  type: "init";
  retry_token?: string;
  worker_version?: string;
}

interface LogEvent {
  type: "log";
  message?: string;
  events?: EngineEvent[];
}

interface ResultChunkEvent {
  type: "result_chunk";
  data?: { cues?: TranslationDelta[]; resolved_source_lang?: string };
}

interface ErrorEvent {
  type: "error";
  message?: string;
  error?: string;
  fatal?: boolean;
  trigger_turnstile?: boolean;
}

interface ResultEvent extends Partial<WorkerSessionPayload>, Omit<TranslateJobResponse, "cues" | "approx_splits" | "quality_warnings"> {
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
