import { detectTextLanguages } from "../../../utils/detect";
import { baseLanguage } from "../common/languageCodes";

const SAMPLE_WINDOWS = 6;
const WINDOW_EVENTS = 30;
const WINDOW_MAX_CHARS = 1500;
const MIN_AGREEMENT = 0.75;

function windowTexts(texts: readonly string[]): string[] {
  if (texts.length <= WINDOW_EVENTS) return [texts.join(" ").slice(0, WINDOW_MAX_CHARS)];
  const span = texts.length - WINDOW_EVENTS;
  return Array.from({ length: SAMPLE_WINDOWS }, (_, index) => {
    const start = Math.round((span * index) / (SAMPLE_WINDOWS - 1));
    return texts.slice(start, start + WINDOW_EVENTS).join(" ").slice(0, WINDOW_MAX_CHARS);
  });
}

export async function consistentLanguage(texts: readonly string[]): Promise<string | null> {
  const detections = await detectTextLanguages(windowTexts(texts));
  const reliable = detections.flatMap((result) => (result?.reliable ? [baseLanguage(result.code)] : []));
  if (!reliable.length) return null;
  const tally = new Map<string, number>();
  for (const language of reliable) tally.set(language, (tally.get(language) ?? 0) + 1);
  const [leader, votes] = [...tally].sort((a, b) => b[1] - a[1])[0];
  return votes / reliable.length >= MIN_AGREEMENT ? leader : null;
}

export async function languagesOfTexts(texts: readonly string[]): Promise<(string | null)[]> {
  const detections = await detectTextLanguages(texts);
  return detections.map((result) => (result?.reliable ? baseLanguage(result.code) : null));
}
