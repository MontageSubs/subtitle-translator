import type { SessionCredentials } from "../translateJob/authorization";
import type { TermInput } from "../../translation/terms/types";

export interface TermsBody extends SessionCredentials {
  clientVersion?: string;
  terms?: unknown;
  source?: string;
  target?: string;
  provider?: string;
}

export interface ParsedTermsRequest {
  terms: TermInput[];
  source: string;
  target: string;
  providerName: string;
}

const AUTO_LANGUAGE = "auto";
const MAX_TERMS = 400;
const MAX_TERM_CHARS = 80;
const FORBIDDEN_TERM_PATTERN = /[\u0000-\u001f\u007f<>\u2045\u2046]/;

function isTermInput(value: unknown): value is TermInput {
  if (!value || typeof value !== "object") return false;
  const { id, text } = value as Record<string, unknown>;
  return typeof id === "number" && Number.isInteger(id) && id >= 0 && typeof text === "string" && text.trim().length > 0 && text.length <= MAX_TERM_CHARS && !FORBIDDEN_TERM_PATTERN.test(text);
}

function parseTerms(value: unknown): TermInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TERMS || !value.every(isTermInput)) return null;
  return new Set(value.map(({ id }) => id)).size === value.length ? value.map(({ id, text }) => ({ id, text: text.trim() })) : null;
}

export function parseTermsRequest(body: TermsBody, defaultProvider: string): ParsedTermsRequest | null {
  const terms = parseTerms(body.terms);
  if (!terms || !body.source || body.source === AUTO_LANGUAGE || !body.target) return null;
  return { terms, source: body.source, target: body.target, providerName: body.provider || defaultProvider };
}
