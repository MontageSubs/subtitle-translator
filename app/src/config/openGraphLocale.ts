import type { LocaleCode } from "../i18n/locales.config";

const OPEN_GRAPH_LOCALES: Readonly<Record<string, string>> = {
  af: "af_ZA",
  ar: "ar_AR",
  ca: "ca_ES",
  cs: "cs_CZ",
  da: "da_DK",
  de: "de_DE",
  el: "el_GR",
  en: "en_US",
  es: "es_ES",
  fi: "fi_FI",
  fr: "fr_FR",
  he: "he_IL",
  hu: "hu_HU",
  it: "it_IT",
  ja: "ja_JP",
  ko: "ko_KR",
  nl: "nl_NL",
  no: "nb_NO",
  pl: "pl_PL",
  pt: "pt_PT",
  "pt-BR": "pt_BR",
  ro: "ro_RO",
  ru: "ru_RU",
  sr: "sr_RS",
  sv: "sv_SE",
  tr: "tr_TR",
  uk: "uk_UA",
  vi: "vi_VN",
  "zh-Hans": "zh_CN",
  "zh-Hant": "zh_TW",
};

function likelyTerritoryLocale(locale: LocaleCode): string {
  const { language, region } = new Intl.Locale(locale).maximize();
  return region ? `${language}_${region}` : language;
}

export const openGraphLocale = (locale: LocaleCode): string => OPEN_GRAPH_LOCALES[locale] ?? likelyTerritoryLocale(locale);
