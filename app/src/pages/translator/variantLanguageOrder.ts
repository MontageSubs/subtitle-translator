import { getLocale } from "../../i18n";
import { SELECTABLE_LANGUAGE_CODES } from "../../utils/languageProfiles";
import { sourceLanguageMemory } from "../../utils/languageMemory";
import { baseLanguage } from "../../lib/subtitle/common/languageCodes";
import { languageName } from "../../utils/languageNames";

export function variantLanguageOrder(): string[] {
  const locale = getLocale();
  const collator = new Intl.Collator(locale);
  const interfaceLanguage = baseLanguage(locale);
  const alphabetical = [...SELECTABLE_LANGUAGE_CODES].sort((a, b) => collator.compare(languageName(a, locale), languageName(b, locale)));
  const interfaceFirst = (code: string): number => Number(baseLanguage(code) === interfaceLanguage);
  return [...new Set([...sourceLanguageMemory.read(), ...alphabetical.sort((a, b) => interfaceFirst(a) - interfaceFirst(b))])];
}
