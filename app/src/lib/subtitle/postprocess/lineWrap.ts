import { OutputMode, CueLayout } from "../types";
import { collapseLineBreaks } from "./displayText";
import { evaluateReadingSpeed } from "../common/lineMetrics";
import { readingProfileFor } from "../common/readingProfiles";
import { splitSpeakers } from "./linebreak/speaker";
import { splitIntoTwoLines } from "./linebreak/split";

export { preloadLineBreakSegmenter } from "./linebreak/segment";

export function shouldWrapTranslation(mode: OutputMode, cueLayout: CueLayout): boolean {
  return mode !== "bilingual" || cueLayout === "split";
}

export function prepareTranslation(text: string, mode: OutputMode, cueLayout: CueLayout, langCode: string, durationMs?: number): string {
  if (!shouldWrapTranslation(mode, cueLayout)) return collapseLineBreaks(text);
  return langCode && text ? wrapLine(text, langCode, durationMs) : text;
}

export function wrapLine(text: string, langCode: string, durationMs?: number): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const speakers = splitSpeakers(trimmed);
  if (speakers) return speakers.join("\n");

  if (trimmed.includes("\n")) return trimmed;

  const metrics = evaluateReadingSpeed(trimmed, durationMs ?? Number.POSITIVE_INFINITY, readingProfileFor(langCode));
  if (!metrics.overLength && !metrics.overCps) return trimmed;

  return splitIntoTwoLines(trimmed, langCode) || trimmed;
}
