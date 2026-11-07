import { t, TranslationKey, getLocale } from "../../i18n";
import type { TranslationParams } from "../../i18n/dictionaries";
import { formatDateTime } from "../../utils/localeFormat";
import type { QuotaHint, TranslationResult } from "./types";
import { activeCooldownUntil } from "./workerCooldown";

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
  client_outdated: "error.appOutdated",
  worker_outdated: "error.serviceUpdating",
  worker_limit: "error.workerLimit",
};

export interface WorkerRequestErrorOptions {
  retryable?: boolean;
  captchaRequired?: boolean;
  fatal?: boolean;
  capacity?: boolean;
  code?: string;
  retryAt?: number;
  quota?: QuotaHint;
  minClientVersion?: string;
  partialResult?: Partial<TranslationResult>;
  streamCut?: boolean;
}

export class WorkerRequestError extends Error {
  readonly retryable: boolean;
  readonly captchaRequired: boolean;
  readonly fatal: boolean;
  readonly capacity: boolean;
  readonly code?: string;
  readonly retryAt?: number;
  readonly quota?: QuotaHint;
  readonly minClientVersion?: string;
  readonly partialResult?: Partial<TranslationResult>;
  readonly streamCut: boolean;

  constructor(message: string, options: WorkerRequestErrorOptions = {}) {
    super(message);
    this.retryable = options.retryable ?? false;
    this.captchaRequired = options.captchaRequired ?? false;
    this.fatal = options.fatal ?? false;
    this.capacity = options.capacity ?? false;
    this.code = options.code;
    this.retryAt = options.retryAt;
    this.quota = options.quota;
    this.minClientVersion = options.minClientVersion;
    this.partialResult = options.partialResult;
    this.streamCut = options.streamCut ?? false;
  }
}

export class LocalizedError extends Error {
  constructor(diagnostic: string, readonly key: TranslationKey, readonly params?: TranslationParams) {
    super(diagnostic);
  }
}

export const isCoolingDown = (error: unknown): boolean =>
  error instanceof WorkerRequestError && error.code === "worker_limit" && activeCooldownUntil() !== null;

export const needsFeedbackLink = (error: unknown): boolean =>
  error instanceof WorkerRequestError && error.code === "worker_limit" && activeCooldownUntil() === null;

const BATCH_BLOCKING_CODES = new Set(["client_outdated", "worker_outdated", "verification_failed", "worker_limit"]);

export function isBatchBlocking(error: unknown): boolean {
  return error instanceof WorkerRequestError && (error.capacity || error.retryAt !== undefined || BATCH_BLOCKING_CODES.has(error.code ?? ""));
}

export function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function localizedErrorMessage(code: string | undefined, fallback: string): string {
  if (code === "worker_limit") {
    const until = activeCooldownUntil();
    if (until !== null) return t("error.cooldown", { count: Math.ceil((until - Date.now()) / 1000) });
  }
  const key = code ? ERROR_MESSAGE_KEYS[code] : undefined;
  return key ? t(key) : fallback;
}

export function formatWorkerError(error: unknown): string {
  if (error instanceof LocalizedError) return t(error.key, error.params);
  if (error instanceof WorkerRequestError && error.retryAt) return t("gate.blocked.body", { time: formatDateTime(error.retryAt, getLocale()) });
  if (error instanceof WorkerRequestError) return localizedErrorMessage(error.code, error.message);
  return t("error.prefix", { message: error instanceof Error ? error.message : String(error) });
}
