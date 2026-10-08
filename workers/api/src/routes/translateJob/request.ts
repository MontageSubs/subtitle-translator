import type { Glossary } from "../../subtitle/types";
import { isValidProtocolCue, type ProtocolCue } from "../../http/protocol";

export interface TranslateJobBody {
  token?: string;
  answer?: number;
  cues?: ProtocolCue[];
  glossary?: Glossary;
  source?: string;
  target?: string;
  provider?: string;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
  contextText?: string;
  contextNeedsTranslation?: boolean;
  clearance?: string;
  proof?: { variant: string; transcript: number[] };
  retryToken?: string;
  requestRetryToken?: boolean;
  isRetry?: boolean;
  attemptNumber?: number;
}

const MAX_GLOSSARY_ENTRIES = 500;
const MAX_GLOSSARY_ENTRY_CHARS = 200;
const MAX_CUES_PER_REQUEST = 20_000;
const UNCOUNTED_BATCH_CUES = 500;

function isValidGlossary(value: unknown): value is Glossary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_GLOSSARY_ENTRIES &&
    entries.every(([key, term]) => typeof term === "string" && key.length <= MAX_GLOSSARY_ENTRY_CHARS && term.length <= MAX_GLOSSARY_ENTRY_CHARS)
  );
}

const isValidCues = (value: unknown): value is ProtocolCue[] =>
  Array.isArray(value) && value.length > 0 && value.length <= MAX_CUES_PER_REQUEST && value.every(isValidProtocolCue);

export interface ParsedRequest {
  body: TranslateJobBody;
  cues: ProtocolCue[];
  glossary: Glossary;
  source: string;
  target: string;
  providerName: string;
  wantsRetryScope: boolean;
}

export function parseRequest(body: TranslateJobBody, defaultProvider: string): ParsedRequest | null {
  if (!isValidCues(body.cues) || !body.source || !body.target) return null;
  return {
    body,
    cues: body.cues,
    glossary: isValidGlossary(body.glossary) ? body.glossary : {},
    source: body.source,
    target: body.target,
    providerName: body.provider || defaultProvider,
    wantsRetryScope: Boolean(body.retryToken) || body.requestRetryToken === true,
  };
}

export const totalChars = (cues: readonly { text: string }[]): number => cues.reduce((sum, cue) => sum + cue.text.length, 0);

export const isCountedJob = (request: ParsedRequest): boolean =>
  !request.wantsRetryScope && request.body.isRetry !== true && request.cues.length >= UNCOUNTED_BATCH_CUES;

