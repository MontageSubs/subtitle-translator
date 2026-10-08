import type { QuotePair } from "../languages/types";

interface RectifyPatterns {
  closeOpen: RegExp;
  closeClose: RegExp;
  openOpen: RegExp;
  trailEnd: RegExp;
  trailPunct: RegExp;
  leadStart: RegExp;
}

const SOURCE_QUOTE_PATTERN = /["”“]/;
const rectifyPatterns = new Map<string, RectifyPatterns>();

function patternsFor([open, close]: QuotePair): RectifyPatterns {
  const key = open + close;
  let cached = rectifyPatterns.get(key);
  if (!cached) {
    const phrase = `([^${open}${close}。！？…\\n]+)`;
    cached = {
      closeOpen: new RegExp(`${close}${phrase}${open}`, "g"),
      closeClose: new RegExp(`${close}${phrase}${close}`, "g"),
      openOpen: new RegExp(`${open}${phrase}${open}`, "g"),
      trailEnd: new RegExp(`${open}(\\s*)$`, "g"),
      trailPunct: new RegExp(`${open}(\\s*[。！？…])`, "g"),
      leadStart: new RegExp(`^(\\s*)${close}`, "g"),
    };
    rectifyPatterns.set(key, cached);
  }
  return cached;
}

export function rectifyTranslationQuotes(translatedText: string, originalText: string, quotes: QuotePair | null): string {
  if (!quotes || !translatedText) return translatedText;
  if (!translatedText.includes(quotes[0]) && !translatedText.includes(quotes[1])) return translatedText;
  const sourceHasQuote = SOURCE_QUOTE_PATTERN.test(originalText);
  const open = sourceHasQuote ? quotes[0] : "";
  const close = sourceHasQuote ? quotes[1] : "";
  const p = patternsFor(quotes);
  return translatedText
    .replace(p.closeOpen, `${open}$1${close}`)
    .replace(p.closeClose, `${open}$1${close}`)
    .replace(p.openOpen, `${open}$1${close}`)
    .replace(p.trailEnd, `${close}$1`)
    .replace(p.trailPunct, `${close}$1`)
    .replace(p.leadStart, `$1${open}`);
}

const countOccurrences = (text: string, literal: string): number => text.split(literal).length - 1;

export function enforceQuoteClosure(parts: string[], quotes: QuotePair | null): string[] {
  if (!quotes || parts.length < 2) return parts;
  const [open, close] = quotes;
  return parts.map((part) => {
    if (!part) return part;
    const opened = countOccurrences(part, open);
    const closed = countOccurrences(part, close);
    if (opened > closed) return part + close.repeat(opened - closed);
    if (closed > opened) return open.repeat(closed - opened) + part;
    return part;
  });
}
