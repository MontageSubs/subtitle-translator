import { removeMarkup } from "../../../subtitle/common/markup";
import { scriptOf } from "../../../subtitle/common/languageCodes";
import { containsScript, isWordBasedScript, scriptLeakPattern } from "../../../subtitle/languages/scripts";

const UNTRANSLATED_WORD_PAIR_THRESHOLD = 2;

export function isUntranslated(text: string, sourceLang: string, targetLang: string): boolean {
  if (!text) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  if (!sourceScript || !targetScript || sourceScript === targetScript || !containsScript(sourceScript, text)) return false;
  const clean = removeMarkup(text, { tags: true, overrides: "ass", markers: true }).trim();
  if (!clean) return false;
  const leaked = clean.match(scriptLeakPattern(sourceScript))?.length ?? 0;
  const threshold = isWordBasedScript(sourceScript) && isWordBasedScript(targetScript) ? UNTRANSLATED_WORD_PAIR_THRESHOLD : 0;
  return leaked > threshold;
}
