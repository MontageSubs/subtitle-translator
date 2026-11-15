import { scriptOf } from "../../lib/subtitle/common/languageCodes";
import { stripStyling } from "../../lib/subtitle/common/markup";
import { isLeakedUntranslated } from "../../lib/subtitle/common/untranslated";
import { dialogueSegments, DialogueSegment } from "../../lib/subtitle/sentence/dialogue";

const PROPER_NAME_PATTERN = /^\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*)*$/u;
const TRAILING_NOISE_PATTERN = /[\s\p{P}\p{N}]+$/u;

const TAG_ALIASES: Readonly<Record<string, string>> = { "zh-cn": "zh-hans", "zh-sg": "zh-hans", "zh-tw": "zh-hant", "zh-hk": "zh-hant" };

const canonicalTag = (tag: string): string => {
  const lower = tag.toLowerCase().replace(/_/g, "-");
  return TAG_ALIASES[lower] ?? lower;
};

export const isSameLanguageTag = (left: string | null | undefined, right: string | null | undefined): boolean =>
  !!left && !!right && canonicalTag(left) === canonicalTag(right);

export type KnownNames = ReadonlySet<string>;

export const knownNamesOf = (glossary: Readonly<Record<string, string>> | undefined): KnownNames =>
  new Set(Object.keys(glossary ?? {}).map((term) => term.toLowerCase()));

function keepsNamesUntranslated(sourceLang: string | null | undefined, targetLang: string | null | undefined): boolean {
  const source = scriptOf(sourceLang);
  return source !== undefined && source !== "cjk" && source === scriptOf(targetLang);
}

function isNameOnly(original: string, known: KnownNames): boolean {
  const bare = stripStyling(original).replace(TRAILING_NOISE_PATTERN, "").trim();
  return known.has(bare.toLowerCase()) || PROPER_NAME_PATTERN.test(bare);
}

export function isUntranslatedCue(original: string, translated: string, sourceLang: string | null | undefined, targetLang: string | null | undefined, known: KnownNames = new Set()): boolean {
  return !isSameLanguageTag(sourceLang, targetLang) && isLeakedUntranslated(original, translated) && !(keepsNamesUntranslated(sourceLang, targetLang) && isNameOnly(original, known));
}

export type CueLeak = { kind: "whole" } | { kind: "segments"; indexes: number[]; originalSegments: DialogueSegment[] };

export function detectCueLeak(original: string, translated: string, sourceLang: string | null | undefined, targetLang: string | null | undefined, known: KnownNames = new Set()): CueLeak | null {
  if (isUntranslatedCue(original, translated, sourceLang, targetLang, known)) return { kind: "whole" };
  const originalSegments = dialogueSegments(original);
  if (originalSegments.length < 2) return null;
  const translatedSegments = dialogueSegments(translated);
  if (translatedSegments.length !== originalSegments.length) return null;
  const indexes = originalSegments.flatMap((segment, index) => (isUntranslatedCue(segment.text, translatedSegments[index]!.text, sourceLang, targetLang, known) ? [index] : []));
  return indexes.length ? { kind: "segments", indexes, originalSegments } : null;
}
