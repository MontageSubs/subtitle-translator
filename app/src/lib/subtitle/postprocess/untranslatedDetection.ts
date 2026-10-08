import { scriptOf } from "../language/resolve";

const STYLE_TAG_PATTERN = /<\/?(?:i|b|u)>/gi;
const OVERRIDE_TAG_PATTERN = /\{\\[^}]*\}/g;
const IGNORED_CHAR_PATTERN = /[\s\p{P}\p{N}\u2669\u266A\u266B\u266C]/gu;
const WORD_PATTERN = /[\p{L}\p{N}_]+/gu;

type DetectionScript = "latin" | "cjk" | undefined;

function detectionScriptOf(lang: string | undefined): DetectionScript {
  const script = scriptOf(lang);
  return script === "latin" || script === "cjk" ? script : undefined;
}

function stripStyling(text: string): string {
  return text.replace(OVERRIDE_TAG_PATTERN, "").replace(STYLE_TAG_PATTERN, "");
}

function normalizeForEquality(text: string): string {
  return stripStyling(text).replace(IGNORED_CHAR_PATTERN, "");
}

function wordCount(text: string): number {
  return (stripStyling(text).match(WORD_PATTERN) || []).length;
}

export function hasTranslatableContent(text: string | undefined): boolean {
  return normalizeForEquality(text || "").length > 0;
}

export function isLeakedUntranslated(original: string, translated: string, sourceLang: string | undefined, targetLang: string | undefined): boolean {
  if (!translated || !hasTranslatableContent(original)) return false;
  const normalizedOriginal = normalizeForEquality(original);

  const sourceScript = detectionScriptOf(sourceLang);
  const targetScript = detectionScriptOf(targetLang);
  const isLatinCjkPair = (sourceScript === "latin" && targetScript === "cjk") || (sourceScript === "cjk" && targetScript === "latin");
  if (!isLatinCjkPair && wordCount(original) < 2) return false;

  return normalizedOriginal === normalizeForEquality(translated);
}
