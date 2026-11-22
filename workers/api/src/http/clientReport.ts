import { noteClientVersion } from "./clientVersion";
import type { RequestContext } from "./context";

const STATUS_NAMES = [
  "ok",
  "timeout",
  "network",
  "stream_cut",
  "canceled",
  "worker_outdated",
  "client_outdated",
  "http_503",
  "job_failed",
  "internal_error",
  "invalid_request",
  "unsupported_language",
  "unsupported_provider",
  "payload_too_large",
  "output_blocked",
  "retry_token_invalid",
  "terms_failed",
  "verification_required",
  "verification_failed",
  "rate_limited",
  "quota_exceeded",
  "capacity_exceeded",
  "access_blocked",
  "unknown",
] as const;

interface ClientReport {
  clientVersion?: unknown;
  ls?: unknown;
}

const isAbsent = (value: unknown): boolean => value === undefined || value === null;

export function readClientReport(rc: RequestContext, body: ClientReport | null): boolean {
  noteClientVersion(rc, body?.clientVersion);
  const code = body?.ls;
  if (isAbsent(code)) return true;
  if (typeof code !== "number" || !Number.isInteger(code) || code < 0 || code >= STATUS_NAMES.length) return false;
  rc.lastStatus = STATUS_NAMES[code]!;
  return true;
}
