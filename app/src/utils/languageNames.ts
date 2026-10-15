import { LocaleCode, DEFAULT_LOCALE } from "../i18n/locales.config";
import { LOCALE_NATIVE_NAMES } from "../i18n/catalog";
import { lookupTranslation, translate } from "../i18n/dictionaries";

type LanguageCode = string;

const namers = new Map<string, Intl.DisplayNames>();
const nativeNames = new Map<LanguageCode, string>();

const nameKey = (code: LanguageCode): string => `language.name.${code}`;

function intlName(code: LanguageCode, locale: LocaleCode): string | undefined {
  const namer = namers.get(locale) ?? new Intl.DisplayNames([locale], { type: "language" });
  namers.set(locale, namer);
  const name = namer.of(code);
  return name && name !== code ? name : undefined;
}

export function languageName(code: LanguageCode, locale: LocaleCode): string {
  return (
    lookupTranslation(locale, nameKey(code)) ??
    intlName(code, locale) ??
    lookupTranslation(DEFAULT_LOCALE, nameKey(code)) ??
    intlName(code, DEFAULT_LOCALE) ??
    code
  );
}

export function nativeLanguageName(code: LanguageCode): string {
  let name = nativeNames.get(code);
  if (name === undefined) {
    const hasIntlData = Intl.DisplayNames.supportedLocalesOf([code]).length > 0;
    name = LOCALE_NATIVE_NAMES[code] ?? (hasIntlData ? intlName(code, code) : undefined) ?? languageName(code, DEFAULT_LOCALE);
    nativeNames.set(code, name);
  }
  return name;
}

export function languageLabelParts(code: LanguageCode, locale: LocaleCode): { name: string; suffix: string } {
  const name = languageName(code, locale);
  const native = nativeLanguageName(code);
  if (!native || native.toLowerCase() === name.toLowerCase()) return { name, suffix: "" };
  const full = translate(locale, "language.withNative", { name, native });
  return full.startsWith(name) ? { name, suffix: full.slice(name.length) } : { name, suffix: "" };
}

export function formatLanguage(code: LanguageCode, locale: LocaleCode): string {
  const { name, suffix } = languageLabelParts(code, locale);
  return name + suffix;
}
