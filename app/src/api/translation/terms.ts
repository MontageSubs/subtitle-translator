import { buildSessionCredentials, isTokenRejection } from "./jobAttempt";
import { withRetry } from "./retry";
import { adoptSession, discardSession, handshake } from "./session";
import { postJson } from "./transport";
import type { WorkerSessionPayload } from "./types";

export interface TermRequestItem {
  id: number;
  text: string;
}

export interface TermsRequest {
  terms: TermRequestItem[];
  source: string;
  target: string;
  provider?: string;
}

export interface TermTranslation {
  id: number;
  translation: string;
}

export interface TermsResponse {
  results: TermTranslation[];
  failed: number[];
}

interface TermsPayload extends WorkerSessionPayload, TermsResponse {}

const isTermTranslation = (value: unknown): value is TermTranslation => {
  const { id, translation } = (value ?? {}) as Partial<TermTranslation>;
  return Number.isInteger(id) && typeof translation === "string" && translation.trim().length > 0;
};

async function sendTerms(request: TermsRequest, signal?: AbortSignal): Promise<TermsPayload> {
  return postJson("/terms", { ...(await buildSessionCredentials(signal)), ...request }, signal);
}

async function attemptTerms(request: TermsRequest, signal?: AbortSignal): Promise<TermsResponse> {
  const payload = await sendTerms(request, signal).catch(async (error) => {
    if (!isTokenRejection(error)) throw error;
    discardSession();
    await handshake(signal);
    return sendTerms(request, signal);
  });
  adoptSession(payload);
  const requested = new Set(request.terms.map(({ id }) => id));
  const results = (Array.isArray(payload.results) ? payload.results : []).filter((item) => isTermTranslation(item) && requested.has(item.id));
  const resolved = new Set(results.map(({ id }) => id));
  return { results, failed: request.terms.map(({ id }) => id).filter((id) => !resolved.has(id)) };
}

export function postTerms(request: TermsRequest, signal?: AbortSignal): Promise<TermsResponse> {
  return withRetry(() => attemptTerms(request, signal), signal);
}
