import { SITE_URL } from "../../../config/config";
import { translate } from "../../../i18n/dictionaries";
import { DEFAULT_LOCALE, LOCALES, LocaleCode } from "../../../i18n/locales.config";
import { matchPreferredLocale } from "../../../i18n/negotiate";
import { Cue, TranslatedCue } from "../types";
import { parseAssTimestamp } from "./clock";

export const DEFAULT_CREDIT_ENABLED = true;

const CREDIT_GAP_MS = 5000;
const CREDIT_DURATION_MS = 4000;
const NUMERIC_IDENTIFIER_PATTERN = /^\d+$/;
const ASS_DIALOGUE_PATTERN = /^Dialogue:\s*[^,]*,([^,]+),([^,]+),/;

type TimeSpan = readonly [startMs: number, endMs: number];

type CueTiming = Pick<TranslatedCue, "id" | "end_ms">;

export interface CreditCue {
  cue: TranslatedCue;
  original: Cue;
}

export interface CreditedCues {
  cues: TranslatedCue[];
  originalById: Map<number, Cue>;
}

export function resolveCreditLocale(targetLang: string): LocaleCode {
  return matchPreferredLocale([targetLang], LOCALES, DEFAULT_LOCALE);
}

function buildCreditText(targetLang: string): string {
  return `${translate(resolveCreditLocale(targetLang), "credit.text")}\n${SITE_URL}/`;
}

function dominantCueSettings(cues: CueTiming[], originalById: Map<number, Cue>): string | undefined {
  const counts = new Map<string, number>();
  for (const { id } of cues) {
    const settings = originalById.get(id)?.cueSettings;
    if (settings) counts.set(settings, (counts.get(settings) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function untranslatedSpans(cues: CueTiming[], originalById: Map<number, Cue>): TimeSpan[] {
  return cues
    .flatMap(({ id }) => [...(originalById.get(id)?.leadingBlocks ?? []), ...(originalById.get(id)?.trailingBlocks ?? [])])
    .flatMap((block) => block.split("\n"))
    .flatMap((line): TimeSpan[] => {
      const match = ASS_DIALOGUE_PATTERN.exec(line);
      return match ? [[parseAssTimestamp(match[1]), parseAssTimestamp(match[2])]] : [];
    });
}

function firstFreeStart(earliestMs: number, spans: TimeSpan[]): number {
  return [...spans]
    .sort((a, b) => a[0] - b[0])
    .reduce((start, [spanStart, spanEnd]) => (spanStart < start + CREDIT_DURATION_MS && spanEnd > start ? spanEnd + CREDIT_GAP_MS : start), earliestMs);
}

function nextIdentifier(lastIdentifier: string | undefined): string | undefined {
  return lastIdentifier && NUMERIC_IDENTIFIER_PATTERN.test(lastIdentifier) ? String(Number(lastIdentifier) + 1) : undefined;
}

export function buildCreditCue(cues: CueTiming[], originalById: Map<number, Cue>, targetLang: string): CreditCue | null {
  if (!cues.length) return null;
  const id = cues.reduce((max, cue) => Math.max(max, cue.id), 0) + 1;
  const lastOriginal = originalById.get(cues[cues.length - 1].id);
  const earliestMs = cues.reduce((latest, cue) => Math.max(latest, cue.end_ms), 0) + CREDIT_GAP_MS;
  const start_ms = firstFreeStart(earliestMs, untranslatedSpans(cues, originalById));
  const end_ms = start_ms + CREDIT_DURATION_MS;
  const text = buildCreditText(targetLang);
  const original: Cue = {
    id,
    start_ms,
    end_ms,
    text,
    cueSettings: dominantCueSettings(cues, originalById),
    identifier: nextIdentifier(lastOriginal?.identifier),
    trailingBlocks: lastOriginal?.trailingBlocks,
  };
  return { cue: { id, start_ms, end_ms, text, translation: null }, original };
}

export function appendCreditCue(cues: TranslatedCue[], originalById: Map<number, Cue>, targetLang: string): CreditedCues {
  const credit = buildCreditCue(cues, originalById, targetLang);
  if (!credit) return { cues, originalById };
  return { cues: [...cues, credit.cue], originalById: new Map(originalById).set(credit.cue.id, credit.original) };
}
