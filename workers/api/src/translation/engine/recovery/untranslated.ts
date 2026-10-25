import { removeMarkup } from "../../../subtitle/common/markup";
import { scriptOf } from "../../../subtitle/common/languageCodes";
import { containsScript, isWordBasedScript, scriptLeakPattern } from "../../../subtitle/languages/scripts";
import type { Script } from "../../../subtitle/languages/types";

const LEAKED_NAME_ALLOWANCE = 2;

const toleratesLeakedNames = (source: Script, target: Script): boolean =>
  isWordBasedScript(source) && (isWordBasedScript(target) || (source === "latin" && target === "cjk"));

export function isUntranslated(text: string, sourceLang: string, targetLang: string): boolean {
  if (!text) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  if (!sourceScript || !targetScript || sourceScript === targetScript || !containsScript(sourceScript, text)) return false;
  const clean = removeMarkup(text, { tags: true, overrides: "ass", markers: true }).trim();
  if (!clean) return false;
  const leaked = clean.match(scriptLeakPattern(sourceScript))?.length ?? 0;
  return leaked > (toleratesLeakedNames(sourceScript, targetScript) ? LEAKED_NAME_ALLOWANCE : 0);
}
