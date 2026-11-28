import type { Glossary } from "../../subtitle/types";
import type { LogField } from "../../logging/fields";
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
const CUE_CHARS_LIMIT = 512;
const LONG_CUE_LENGTH_BITS = ~(CUE_CHARS_LIMIT - 1);
const MEAN_CUE_CHARS_LIMIT = 200;
const MEAN_CHECK_MIN_CUES = 8;

export type CueShape = "subtitle" | "oversized_cue" | "dense_cues";

function isValidGlossary(value: unknown): value is Glossary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_GLOSSARY_ENTRIES &&
    entries.every(([key, term]) => typeof term === "string" && key.length <= MAX_GLOSSARY_ENTRY_CHARS && term.length <= MAX_GLOSSARY_ENTRY_CHARS)
  );
}

interface CueScan {
  cues: ProtocolCue[];
  chars: number;
  shape: CueShape;
}

function scanCues(value: unknown): CueScan | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CUES_PER_REQUEST) return null;
  let chars = 0;
  let lengthBits = 0;
  for (const cue of value) {
    if (!isValidProtocolCue(cue)) return null;
    const length = cue.text.length;
    chars += length;
    lengthBits |= length;
  }
  const shape: CueShape =
    (lengthBits & LONG_CUE_LENGTH_BITS) !== 0
      ? "oversized_cue"
      : value.length >= MEAN_CHECK_MIN_CUES && chars > MEAN_CUE_CHARS_LIMIT * value.length
        ? "dense_cues"
        : "subtitle";
  return { cues: value, chars, shape };
}

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
  chars: number;
  shape: CueShape;
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
  const scan = scanCues(body.cues);
  if (!scan || !body.source || !body.target) return null;
  return {
    body,
    cues: scan.cues,
    chars: scan.chars,
    shape: scan.shape,
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

export const attemptFields = ({ attempt, body, part }: ParsedRequest): LogField[] => [["attempt", attempt], ["retry", body.isRetry === true], ["part", part]];

export const totalChars = (cues: readonly { text: string }[]): number => cues.reduce((sum, cue) => sum + cue.text.length, 0);

export const isCountedJob = (request: ParsedRequest): boolean =>
  !request.wantsRetryScope && request.body.isRetry !== true && request.cues.length >= UNCOUNTED_BATCH_CUES;

