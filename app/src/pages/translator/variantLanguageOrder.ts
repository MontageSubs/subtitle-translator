import { getLocale } from "../../i18n";
import { SELECTABLE_LANGUAGE_CODES, quickPickLanguageCodes } from "../../utils/languageProfiles";
import { readLanguageMemory } from "../../utils/languageMemory";
import { languageName } from "../../utils/languageNames";
import type { WorkspaceState } from "./state";

export function variantLanguageOrder(state: WorkspaceState): string[] {
  const locale = getLocale();
  const collator = new Intl.Collator(locale);
  const alphabetical = [...SELECTABLE_LANGUAGE_CODES].sort((a, b) => collator.compare(languageName(a, locale), languageName(b, locale)));
  return [...new Set([state.targetLang, ...readLanguageMemory(), ...quickPickLanguageCodes(locale), ...alphabetical])];
}
