import type { Plugin } from "vite";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LocaleCode } from "../../src/i18n/locales.config";
import { renderLocaleResolver } from "./localeGate";
import { readNativeName } from "./locales";

const ALTERNATES_MARKER = "<!--i18n:alternates-->";
const LANGUAGE_OPTIONS_MARKER = "<!--i18n:language-options-->";
const SUPPORTED_MARKER = "__I18N_SUPPORTED__";
const RESOLVER_MARKER = "__I18N_RESOLVER__";

export function htmlLocaleGatePlugin(locales: readonly LocaleCode[]): Plugin {
  const hrefFor = (locale: LocaleCode) => `./${locale}/`;
  const alternates = [
    ...locales.map((locale) => `<link rel="alternate" hreflang="${locale}" href="${hrefFor(locale)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${hrefFor(DEFAULT_LOCALE)}" />`,
  ].join("\n    ");
  const languageOptions = locales
    .map((locale) => `<a href="./${locale}/" lang="${locale}" hreflang="${locale}">${readNativeName(locale)}</a>`)
    .join("\n          ");
  const resolver = renderLocaleResolver({ supported: locales, fallback: DEFAULT_LOCALE, storageKey: LOCALE_STORAGE_KEY });

  return {
    name: "html-locale-gate",
    transformIndexHtml: (html) =>
      html
        .replace(ALTERNATES_MARKER, () => alternates)
        .replace(LANGUAGE_OPTIONS_MARKER, () => languageOptions)
        .replace(SUPPORTED_MARKER, () => JSON.stringify(locales))
        .replace(RESOLVER_MARKER, () => resolver),
  };
}
