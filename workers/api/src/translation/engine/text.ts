import { countContentChars } from "../../subtitle/contentChars";

const CONTENT_CHAR_PATTERN = /[\p{L}\p{N}_]/u;
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
