const LATIN_CODES = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "tr",
  "id", "vi", "ms", "tl", "ca", "eu", "gl", "la",
]);
const CJK_CODES = new Set(["zh", "ja", "ko", "yue"]);

const STYLE_TAG_PATTERN = /<\/?(?:i|b|u)>/gi;
const OVERRIDE_TAG_PATTERN = /\{\\[^}]*\}/g;
const IGNORED_CHAR_PATTERN = /[\s\p{P}\p{N}\u2669\u266A\u266B\u266C]/gu;
const WORD_PATTERN = /[\p{L}\p{N}_]+/gu;

type Script = "latin" | "cjk" | undefined;

function scriptOf(lang: string | undefined): Script {
  const code = (lang || "").split("-")[0].toLowerCase();
  if (LATIN_CODES.has(code)) return "latin";
  return CJK_CODES.has(code) ? "cjk" : undefined;
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

  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  const isLatinCjkPair = (sourceScript === "latin" && targetScript === "cjk") || (sourceScript === "cjk" && targetScript === "latin");
  if (!isLatinCjkPair && wordCount(original) < 2) return false;

  return normalizedOriginal === normalizeForEquality(translated);
}
