import { LOCALES, LOCALE_CREDIT_TEXTS, LOCALE_NATIVE_NAMES } from "virtual:locale-catalog";
import type { LocaleCode } from "./locales.config";

export { LOCALES, LOCALE_CREDIT_TEXTS, LOCALE_NATIVE_NAMES };

export const isLocaleCode = (value: string): value is LocaleCode => LOCALES.includes(value);
