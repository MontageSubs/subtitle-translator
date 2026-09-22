import { OutputMode, CueLayout } from "../../utils/types";
import { evaluateLineMetrics } from "./lineMetrics";
import { splitSpeakers } from "./linebreak/speaker";
import { splitIntoTwoLines } from "./linebreak/split";

export { preloadLineBreakSegmenter } from "./linebreak/segment";

export function shouldWrapTranslation(mode: OutputMode, cueLayout: CueLayout): boolean {
  return mode !== "bilingual" || cueLayout === "split";
}

export function wrapLine(text: string, langCode: string, durationMs?: number): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const speakers = splitSpeakers(trimmed);
  if (speakers) return speakers.join("\n");

  if (trimmed.includes("\n")) return trimmed;

  const metrics = evaluateLineMetrics(trimmed, durationMs ?? Number.POSITIVE_INFINITY, langCode);
  if (!metrics.overLength && !metrics.overCps) return trimmed;

  return splitIntoTwoLines(trimmed, langCode) || trimmed;
}
