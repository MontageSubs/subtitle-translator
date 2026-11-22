import type { Glossary } from "../../subtitle/types";
import { isValidProtocolCue, type ProtocolCue } from "../../http/protocol";

export interface TranslationRequestBody {
  token?: string;
  clientVersion?: string;
  ls?: unknown;
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
  batchReport?: unknown;
}

const MAX_GLOSSARY_ENTRIES = 500;
const MAX_GLOSSARY_ENTRY_CHARS = 200;
const MAX_CUES_PER_REQUEST = 20_000;
const MAX_BATCH_REPORT_PARTS = 99;
const MAX_LOGGED_ATTEMPT = 99;
const MAX_LOGGED_SCENE_SECONDS = 9999;
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

const isPartNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_BATCH_REPORT_PARTS;

export function readBatchReport(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 2) return "";
  const [index, total] = value;
  return isPartNumber(index) && isPartNumber(total) && index <= total ? `${index}/${total}` : "";
}

const readAttempt = (value: unknown): number => (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_LOGGED_ATTEMPT ? (value as number) : 1);

const readSceneSeconds = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.round(value * 10) / 10, MAX_LOGGED_SCENE_SECONDS) : undefined;

export interface ParsedRequest {
  body: TranslationRequestBody;
  cues: ProtocolCue[];
  glossary: Glossary;
  source: string;
  target: string;
  providerName: string;
  wantsRetryScope: boolean;
  part: string;
  attempt: number;
  sceneSeconds: number | undefined;
}

export function parseRequest(body: TranslationRequestBody, defaultProvider: string): ParsedRequest | null {
  if (!isValidCues(body.cues) || !body.source || !body.target) return null;
  return {
    body,
    cues: body.cues,
    glossary: isValidGlossary(body.glossary) ? body.glossary : {},
    source: body.source,
    target: body.target,
    providerName: body.provider || defaultProvider,
    wantsRetryScope: Boolean(body.retryToken) || body.requestRetryToken === true,
    part: readBatchReport(body.batchReport),
    attempt: readAttempt(body.attemptNumber),
    sceneSeconds: readSceneSeconds(body.sceneChangeSeconds),
  };
}

export const totalChars = (cues: readonly { text: string }[]): number => cues.reduce((sum, cue) => sum + cue.text.length, 0);

export const isCountedJob = (request: ParsedRequest): boolean =>
  !request.wantsRetryScope && request.body.isRetry !== true && request.cues.length >= UNCOUNTED_BATCH_CUES;

