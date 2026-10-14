import { translate, TranslationKey, getDictionary } from "../i18n/dictionaries";
import type { LocaleCode } from "../i18n/locales.config";

type LanguageCode = string;

const namers = new Map<string, Intl.DisplayNames>();

function intlName(code: LanguageCode, locale: string): string | undefined {
  const namer = namers.get(locale) ?? new Intl.DisplayNames([locale], { type: "language" });
  namers.set(locale, namer);
  const name = namer.of(code);
  return name && name !== code ? name : undefined;
}

export function languageName(code: LanguageCode, locale: LocaleCode): string {
  const key = `language.name.${code}` as TranslationKey;
  const translated = translate(locale, key);
  if (translated !== key) return translated;
  return intlName(code, locale) ?? intlName(code, "en") ?? code;
}

const nativeNames = new Map<LanguageCode, string | undefined>();

function nativeLanguageName(code: LanguageCode): string | undefined {
  if (!nativeNames.has(code)) {
    const selfKey = `language.name.${code}` as TranslationKey;
    const fromSelfDict = getDictionary(code)?.[selfKey];
    if (fromSelfDict) {
      nativeNames.set(code, fromSelfDict);
      return fromSelfDict;
    }
    const supported = Intl.DisplayNames.supportedLocalesOf([code]).length > 0;
    nativeNames.set(code, supported ? intlName(code, code) : undefined);
  }
  return nativeNames.get(code);
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
