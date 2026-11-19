import { getLocale } from "../../i18n";
import { SELECTABLE_LANGUAGE_CODES } from "../../utils/languageProfiles";
import { sourceLanguageMemory } from "../../utils/languageMemory";
import { baseLanguage } from "../../lib/subtitle/common/languageCodes";
import type { LanguagePreference } from "../../lib/subtitle/variants/selection";
import { languageNameComparator } from "../../utils/languageNames";

export function variantLanguagePreference(): LanguagePreference {
  const locale = getLocale();
  const recent = sourceLanguageMemory.read();
  const alphabetical = [...SELECTABLE_LANGUAGE_CODES].sort(languageNameComparator(locale));
  return { order: [...new Set([...recent, ...alphabetical])], weightedCount: recent.length, interfaceLanguage: baseLanguage(locale) };
}
