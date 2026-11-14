import { removeMarkup } from "../../../subtitle/common/markup";
import { preservedLatinWords } from "../../../subtitle/common/preservedWords";
import { scriptOf } from "../../../subtitle/common/languageCodes";
import { containsScript, isWordBasedScript, scriptLeakPattern } from "../../../subtitle/languages/scripts";
import type { Script } from "../../../subtitle/languages/types";

const LEAKED_NAME_ALLOWANCE = 2;

const toleratesLeakedNames = (source: Script, target: Script): boolean =>
  isWordBasedScript(source) && (isWordBasedScript(target) || (source === "latin" && target === "cjk"));

export function isUntranslated(text: string, sourceLang: string, targetLang: string, originalText = ""): boolean {
  if (!text) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  if (!sourceScript || !targetScript || sourceScript === targetScript || !containsScript(sourceScript, text)) return false;
  const clean = removeMarkup(text, { tags: true, overrides: "ass", markers: true }).trim();
  if (!clean) return false;
  const leakedWords = clean.match(scriptLeakPattern(sourceScript)) ?? [];
  const allowance = toleratesLeakedNames(sourceScript, targetScript) ? LEAKED_NAME_ALLOWANCE : 0;
  if (leakedWords.length <= allowance) return false;
  if (sourceScript !== "latin" || !originalText) return true;
  const preserved = preservedLatinWords(originalText, sourceLang);
  return leakedWords.filter((word) => !preserved.has(word.toLowerCase())).length > allowance;
}
