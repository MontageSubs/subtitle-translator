import { scriptOf } from "../../subtitle/languages/registry";
import { containsScript, isWordBasedScript, scriptLeakPattern } from "../../subtitle/languages/scripts";
import { normalizeForEquality, wordCount } from "./text";

const STYLE_AND_TAG_STRIP_PATTERN = /\{\\[^}]*\}|<[^>]*>|\u27e6[^\u27e6\u27e7]*\u27e7/g;
const UNTRANSLATED_WORD_PAIR_THRESHOLD = 2;

export function isUntranslated(text: string, sourceLang: string, targetLang: string): boolean {
  if (!text) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  if (!sourceScript || !targetScript || sourceScript === targetScript || !containsScript(sourceScript, text)) return false;
  const clean = text.replace(STYLE_AND_TAG_STRIP_PATTERN, "").trim();
  if (!clean) return false;
  const leaked = clean.match(scriptLeakPattern(sourceScript))?.length ?? 0;
  const threshold = isWordBasedScript(sourceScript) && isWordBasedScript(targetScript) ? UNTRANSLATED_WORD_PAIR_THRESHOLD : 0;
  return leaked > threshold;
}

export function isLeakedUntranslated(original: string, translated: string, sourceLang: string, targetLang: string): boolean {
  if (!translated) return false;
  const normalizedOriginal = normalizeForEquality(original);
  if (!normalizedOriginal) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  const crossesCjkBoundary = (sourceScript === "latin" && targetScript === "cjk") || (sourceScript === "cjk" && targetScript === "latin");
  if (!crossesCjkBoundary && wordCount(original) < 2) return false;
  return normalizedOriginal === normalizeForEquality(translated);
}
