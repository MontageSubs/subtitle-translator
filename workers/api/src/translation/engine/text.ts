import { countContentChars } from "../../subtitle/charClass";

const CONTENT_CHAR_PATTERN = /[\p{L}\p{N}_]/u;
const WORD_PATTERN = /[\p{L}\p{N}_]+/gu;
const STYLE_TAG_PATTERN = /<\/?(?:i|b|u)>/gi;
const EQUALITY_NOISE_PATTERN = /[\s\p{P}\p{N}\u2669\u266A\u266B\u266C]/gu;
const LENGTH_RATIO_MIN = 0.15;
const LENGTH_RATIO_MAX = 6.0;

const HTML_SPECIAL_PATTERN = /[&<>]/;

export const escapeHtml = (text: string): string =>
  HTML_SPECIAL_PATTERN.test(text) ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : text;

export const unescapeHtml = (text: string): string =>
  text.includes("&") ? text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&") : text;

export const hasContent = (text: string | null | undefined): boolean => Boolean(text) && CONTENT_CHAR_PATTERN.test(text!);

export const contentLength = (text: string | null | undefined): number => (text ? countContentChars(text) : 0);

export function isLengthPlausible(source: string, translated: string): boolean {
  const sourceLength = contentLength(source);
  if (sourceLength === 0) return true;
  const ratio = contentLength(translated) / sourceLength;
  return ratio >= LENGTH_RATIO_MIN && ratio <= LENGTH_RATIO_MAX;
}

const SURROGATE_PATTERN = /[\ud800-\udfff]/;

export function charLength(text: string): number {
  if (!SURROGATE_PATTERN.test(text)) return text.length;
  let count = 0;
  for (const _ of text) count++;
  return count;
}

export const normalizeForEquality = (text: string): string => (text || "").replace(STYLE_TAG_PATTERN, "").replace(EQUALITY_NOISE_PATTERN, "");

export const wordCount = (text: string): number => (text || "").replace(STYLE_TAG_PATTERN, "").match(WORD_PATTERN)?.length ?? 0;
