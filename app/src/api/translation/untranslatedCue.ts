import { scriptOf } from "../../lib/subtitle/common/languageCodes";
import { stripStyling } from "../../lib/subtitle/common/markup";
import { isLeakedUntranslated } from "../../lib/subtitle/common/untranslated";

const PROPER_NAME_PATTERN = /^\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*)*$/u;
const TRAILING_NOISE_PATTERN = /[\s\p{P}\p{N}]+$/u;

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
  return isLeakedUntranslated(original, translated) && !(keepsNamesUntranslated(sourceLang, targetLang) && isNameOnly(original, known));
}
