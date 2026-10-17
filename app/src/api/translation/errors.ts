import { t, TranslationKey } from "../../i18n";
import { getLocale } from "../../i18n";
import { formatDateTime } from "../../utils/localeFormat";
import type { QuotaHint, TranslateJobResponse } from "./types";

const ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
  invalid_request: "error.invalidRequest",
  unsupported_language: "error.unsupportedLanguage",
  verification_failed: "error.verificationFailed",
  verification_required: "error.verificationRequired",
  capacity_exceeded: "error.capacityExceeded",
  payload_too_large: "error.payloadTooLarge",
  rate_limited: "error.rateLimited",
  quota_exceeded: "error.quotaExceeded",
  output_blocked: "error.outputBlocked",
  timeout: "error.timeout",
  network_error: "error.networkError",
  client_outdated: "error.clientOutdated",
  worker_outdated: "error.workerOutdated",
};

export interface WorkerRequestErrorOptions {
  retryable?: boolean;
  triggerTurnstile?: boolean;
  fatal?: boolean;
  capacity?: boolean;
  code?: string;
  retryAt?: number;
  quota?: QuotaHint;
  minClientVersion?: string;
  partialResult?: Partial<TranslateJobResponse>;
}

export class WorkerRequestError extends Error {
  readonly retryable: boolean;
  readonly triggerTurnstile: boolean;
  readonly fatal: boolean;
  readonly capacity: boolean;
  readonly code?: string;
  readonly retryAt?: number;
  readonly quota?: QuotaHint;
  readonly minClientVersion?: string;
  readonly partialResult?: Partial<TranslateJobResponse>;

  constructor(message: string, options: WorkerRequestErrorOptions = {}) {
    super(message);
    this.retryable = options.retryable ?? false;
    this.triggerTurnstile = options.triggerTurnstile ?? false;
    this.fatal = options.fatal ?? false;
    this.capacity = options.capacity ?? false;
    this.code = options.code;
    this.retryAt = options.retryAt;
    this.quota = options.quota;
    this.minClientVersion = options.minClientVersion;
    this.partialResult = options.partialResult;
  }
}

export function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function localizedErrorMessage(code: string | undefined, fallback: string): string {
  const key = code ? ERROR_MESSAGE_KEYS[code] : undefined;
  return key ? t(key) : fallback;
}

export function formatWorkerError(error: unknown): string {
  if (error instanceof WorkerRequestError && error.retryAt) return t("gate.blocked.body", { time: formatDateTime(error.retryAt, getLocale()) });
  if (error instanceof WorkerRequestError) return localizedErrorMessage(error.code, error.message);
  return t("error.prefix", { message: error instanceof Error ? error.message : String(error) });
}
