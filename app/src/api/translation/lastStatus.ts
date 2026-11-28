import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";
import { WorkerRequestError } from "./errors";

const STATUS_CODE = {
  ok: 0,
  timeout: 1,
  network: 2,
  streamCut: 3,
  canceled: 4,
  workerOutdated: 5,
  clientOutdated: 6,
  http503: 7,
  jobFailed: 8,
  internalError: 9,
  invalidRequest: 10,
  unsupportedLanguage: 11,
  unsupportedProvider: 12,
  payloadTooLarge: 13,
  outputBlocked: 14,
  retryTokenInvalid: 15,
  termsFailed: 16,
  verificationRequired: 17,
  verificationFailed: 18,
  rateLimited: 19,
  quotaExceeded: 20,
  capacityExceeded: 21,
  accessBlocked: 22,
  unknown: 23,
} as const;

const STATUS_BY_WORKER_CODE: Readonly<Record<string, number>> = {
  timeout: STATUS_CODE.timeout,
  worker_outdated: STATUS_CODE.workerOutdated,
  client_outdated: STATUS_CODE.clientOutdated,
  worker_limit: STATUS_CODE.http503,
  internal_error: STATUS_CODE.internalError,
  invalid_request: STATUS_CODE.invalidRequest,
  unreadable_subtitle: STATUS_CODE.invalidRequest,
  unsupported_language: STATUS_CODE.unsupportedLanguage,
  unsupported_provider: STATUS_CODE.unsupportedProvider,
  payload_too_large: STATUS_CODE.payloadTooLarge,
  output_blocked: STATUS_CODE.outputBlocked,
  retry_token_invalid: STATUS_CODE.retryTokenInvalid,
  terms_failed: STATUS_CODE.termsFailed,
  verification_required: STATUS_CODE.verificationRequired,
  verification_failed: STATUS_CODE.verificationFailed,
  rate_limited: STATUS_CODE.rateLimited,
  quota_exceeded: STATUS_CODE.quotaExceeded,
  capacity_exceeded: STATUS_CODE.capacityExceeded,
  access_blocked: STATUS_CODE.accessBlocked,
};

const MAX_AGE_MS = 86_400_000;
const FIELD_SEPARATOR = ":";

interface Remembered {
  code: number;
  at: number;
}

function readRemembered(): Remembered | null {
  const [code, at] = (persistentStorage.getItem(STORAGE_KEYS.lastStatus) ?? "").split(FIELD_SEPARATOR).map(Number);
  const valid = Number.isInteger(code) && code! >= 0 && code! <= STATUS_CODE.unknown && Number.isFinite(at) && Date.now() - at! < MAX_AGE_MS;
  return valid ? { code: code!, at: at! } : null;
}

let remembered = readRemembered();

function remember(code: number): void {
  remembered = { code, at: Date.now() };
  persistentStorage.setItem(STORAGE_KEYS.lastStatus, `${code}${FIELD_SEPARATOR}${remembered.at}`);
}

function statusOf(error: unknown): number {
  if (error instanceof DOMException && error.name === "AbortError") return STATUS_CODE.canceled;
  if (!(error instanceof WorkerRequestError)) return STATUS_CODE.unknown;
  if (error.code === "network_error") return error.streamCut ? STATUS_CODE.streamCut : STATUS_CODE.network;
  return error.code === undefined ? STATUS_CODE.jobFailed : STATUS_BY_WORKER_CODE[error.code] ?? STATUS_CODE.unknown;
}

export const recordInteractionSuccess = (): void => remember(STATUS_CODE.ok);

export const recordInteractionFailure = (error: unknown): void => remember(statusOf(error));

export const lastStatusField = (): { ls?: number } => (remembered && Date.now() - remembered.at < MAX_AGE_MS ? { ls: remembered.code } : {});
