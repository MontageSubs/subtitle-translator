import { OutputMode, CueLayout } from "../types";
import { attachDanglingMarkup } from "./danglingMarkup";
import { collapseLineBreaks } from "./displayText";
import { evaluateReadingSpeed } from "../common/lineMetrics";
import { readingProfileFor } from "../common/readingProfiles";
import { splitSpeakers } from "./linebreak/speaker";
import { splitIntoTwoLines } from "./linebreak/split";
import { PunctuationStyle, restylePunctuation } from "./punctuationStyle";

export { preloadLineBreakSegmenter } from "./linebreak/segment";

export function shouldWrapTranslation(mode: OutputMode, cueLayout: CueLayout): boolean {
  return mode !== "bilingual" || cueLayout === "split";
}

export function prepareTranslation(text: string, mode: OutputMode, cueLayout: CueLayout, langCode: string, punctuation?: PunctuationStyle): string {
  const styled = langCode ? restylePunctuation(text, langCode, punctuation) : text;
  if (!shouldWrapTranslation(mode, cueLayout)) return collapseLineBreaks(styled);
  return langCode && styled ? wrapLine(styled, langCode) : styled;
}

export function wrapLine(text: string, langCode: string): string {
  const trimmed = attachDanglingMarkup(text.trim());
  if (!trimmed) return trimmed;

  const speakers = splitSpeakers(trimmed);
  if (speakers) return speakers.join("\n");

  if (trimmed.includes("\n")) return trimmed;

  if (!evaluateReadingSpeed(trimmed, Number.POSITIVE_INFINITY, readingProfileFor(langCode)).overLength) return trimmed;

  return splitIntoTwoLines(trimmed, langCode) || trimmed;
}
