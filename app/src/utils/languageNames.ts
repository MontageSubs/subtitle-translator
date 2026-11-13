import { LocaleCode, DEFAULT_LOCALE } from "../i18n/locales.config";
import { LOCALE_NATIVE_NAMES } from "../i18n/catalog";
import { lookupTranslation, translate } from "../i18n/dictionaries";

type LanguageCode = string;

const namers = new Map<string, Intl.DisplayNames>();
const nativeNames = new Map<LanguageCode, string>();

const nameKey = (code: LanguageCode): string => `language.name.${code}`;
const regionKey = (region: string): string => `region.name.${region}`;
const REGIONAL_TAG = /^([a-z]{2,3})-([A-Z]{2}|\d{3})$/;

function intlName(code: LanguageCode, locale: LocaleCode): string | undefined {
  const namer = namers.get(locale) ?? new Intl.DisplayNames([locale], { type: "language" });
  namers.set(locale, namer);
  const name = namer.of(code);
  return name && name !== code ? name : undefined;
}

const regionNamers = new Map<string, Intl.DisplayNames>();

function regionName(region: string, locale: LocaleCode): string | undefined {
  const explicit = lookupTranslation(locale, regionKey(region));
  if (explicit) return explicit;
  const namer = regionNamers.get(locale) ?? new Intl.DisplayNames([locale], { type: "region" });
  regionNamers.set(locale, namer);
  const name = namer.of(region);
  return name && name !== region ? name : undefined;
}

function composedRegionalName(code: LanguageCode, locale: LocaleCode): string | undefined {
  const match = REGIONAL_TAG.exec(code);
  if (!match) return undefined;
  const region = regionName(match[2], locale);
  return region ? translate(locale, "language.withRegion", { language: languageName(match[1], locale), region }) : undefined;
}

export function languageName(code: LanguageCode, locale: LocaleCode): string {
  return (
    lookupTranslation(locale, nameKey(code)) ??
    composedRegionalName(code, locale) ??
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
