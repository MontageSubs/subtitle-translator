import { getLocale } from "../../i18n";
import { SELECTABLE_LANGUAGE_CODES, quickPickLanguageCodes } from "../../utils/languageProfiles";
import { targetLanguageMemory } from "../../utils/languageMemory";
import { languageName } from "../../utils/languageNames";
import type { WorkspaceState } from "./state";

export function variantLanguageOrder(state: WorkspaceState): string[] {
  const locale = getLocale();
  const collator = new Intl.Collator(locale);
  const alphabetical = [...SELECTABLE_LANGUAGE_CODES].sort((a, b) => collator.compare(languageName(a, locale), languageName(b, locale)));
  return [...new Set([state.targetLang, ...targetLanguageMemory.read(), ...quickPickLanguageCodes(locale), ...alphabetical])];
}
