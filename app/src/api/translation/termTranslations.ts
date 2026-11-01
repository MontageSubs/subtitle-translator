import { buildSessionCredentials, isTokenRejection } from "./jobAttempt";
import { withRetry } from "./retry";
import { adoptSession, discardSession, openSession } from "./session";
import { postJson } from "./transport";
import type { WorkerSessionPayload } from "./types";

interface TermRequestItem {
  id: number;
  text: string;
}

export interface TermTranslationsRequest {
  terms: TermRequestItem[];
  source: string;
  target: string;
  provider?: string;
}

interface TermTranslation {
  id: number;
  translation: string;
}

export interface TermTranslationsResponse {
  results: TermTranslation[];
  failed: number[];
}

interface TermTranslationsPayload extends WorkerSessionPayload, TermTranslationsResponse {}

const isTermTranslation = (value: unknown): value is TermTranslation => {
  const { id, translation } = (value ?? {}) as Partial<TermTranslation>;
  return Number.isInteger(id) && typeof translation === "string" && translation.trim().length > 0;
};

async function sendTermTranslations(request: TermTranslationsRequest, signal?: AbortSignal): Promise<TermTranslationsPayload> {
  return postJson("/term-translations", { ...(await buildSessionCredentials(signal)), ...request }, signal);
}

async function attemptTermTranslations(request: TermTranslationsRequest, signal?: AbortSignal): Promise<TermTranslationsResponse> {
  const payload = await sendTermTranslations(request, signal).catch(async (error) => {
    if (!isTokenRejection(error)) throw error;
    discardSession();
    await openSession(signal);
    return sendTermTranslations(request, signal);
  });
  adoptSession(payload);
  const requested = new Set(request.terms.map(({ id }) => id));
  const results = (Array.isArray(payload.results) ? payload.results : []).filter((item) => isTermTranslation(item) && requested.has(item.id));
  const resolved = new Set(results.map(({ id }) => id));
  return { results, failed: request.terms.map(({ id }) => id).filter((id) => !resolved.has(id)) };
}

export function postTermTranslations(request: TermTranslationsRequest, signal?: AbortSignal): Promise<TermTranslationsResponse> {
  return withRetry(() => attemptTermTranslations(request, signal), signal);
}
