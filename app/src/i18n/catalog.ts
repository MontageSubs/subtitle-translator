import { LOCALES, LOCALE_CREDIT_TEXTS, LOCALE_MENU_NAMES, LOCALE_NATIVE_NAMES, LOCALE_SWITCH_PROMPTS } from "virtual:locale-catalog";
import type { LocaleCode } from "./locales.config";

export { LOCALES, LOCALE_CREDIT_TEXTS, LOCALE_MENU_NAMES, LOCALE_NATIVE_NAMES, LOCALE_SWITCH_PROMPTS };

export const isLocaleCode = (value: string): value is LocaleCode => LOCALES.includes(value);
