import { baseLanguage, scriptOf } from "../../subtitle/common/languageCodes";
import { casedRules } from "./cased";
import { chineseRules, japaneseRules } from "./cjk";
import type { EntityLanguageRules } from "./shared";
import { uncasedRules } from "./uncased";

export const RULES_VERSION = 1;

const CASED_SCRIPTS: ReadonlySet<string | undefined> = new Set(["latin", "cyrillic", "greek"]);

export function entityRulesFor(sourceLang: string): EntityLanguageRules {
  const base = baseLanguage(sourceLang);
  if (base === "ja") return japaneseRules;
  if (base === "zh" || base === "yue") return chineseRules;
  return CASED_SCRIPTS.has(scriptOf(sourceLang)) ? casedRules : uncasedRules;
}
